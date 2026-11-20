import { FormEvent, useEffect, useRef, useState } from 'react';

type Ranch = { id?: string; ranchId?: string; name?: string; [key: string]: unknown };
type Session = {
  accessToken: string;
  refreshToken?: string;
  role: string;
  username: string;
  ranches: Ranch[];
};
type ApiPayload = Record<string, unknown> & { data?: ApiPayload };

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://du6aq4me7fp0q.cloudfront.net/api/v1').replace(/\/$/, '');
const STORAGE_KEY = 'baapp.session';
const AUDIT_ROLES = new Set(['ASSOCIATION_SUPERUSER', 'VET_TECHNICIAN']);

function readSession(): Session | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const value = JSON.parse(saved) as Session;
    return typeof value.accessToken === 'string' ? value : null;
  } catch {
    return null;
  }
}

function tokenFrom(payload: ApiPayload): string {
  const data = payload.data || payload;
  return String(data.accessToken || data.access_token || data.token || data.jwt || payload.accessToken || payload.access_token || payload.token || payload.jwt || '');
}

// fix(issue-3): also accept a bare-array response body (e.g. GET /ranches → [{...},...])
// and an array nested under data, in addition to the existing named-key shapes.
// Returns undefined only when no supported array shape is found.
function ranchesFrom(payload: ApiPayload): Ranch[] | undefined {
  if (Array.isArray(payload)) return payload as Ranch[];
  const candidates = [
    payload.ranches, payload.accessibleRanches, payload.accessible_ranches,
    payload.data?.ranches, payload.data?.accessibleRanches, payload.data?.accessible_ranches,
    payload.data?.content, payload.content,
    Array.isArray(payload.data) ? payload.data : undefined,
  ];
  return candidates.find(Array.isArray) as Ranch[] | undefined;
}

function roleFrom(payload: ApiPayload, token: string): string {
  const data = payload.data || payload;
  const user = (data.user || {}) as Record<string, unknown>;
  let role = String(user.role || data.role || '');
  if (!role && token.split('.')[1]) {
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      role = claims.role || claims.authorities?.[0] || '';
    } catch { /* Role-based UI stays restricted when claims cannot be read. */ }
  }
  return role.toUpperCase().replace(/^ROLE_/, '');
}

function saveSession(session: Session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function readPayload(response: Response): Promise<ApiPayload> {
  try { return await response.json() as ApiPayload; }
  catch { return {}; }
}

async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const session = readSession();
  const send = (token?: string) => {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };
  let response = await send(session?.accessToken);
  if (response.status !== 401) return response;
  if (!session?.refreshToken) throw new Error('SESSION_EXPIRED');

  const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!refreshed.ok) throw new Error('SESSION_EXPIRED');
  const payload = await readPayload(refreshed);
  const accessToken = tokenFrom(payload);
  if (!accessToken) throw new Error('SESSION_EXPIRED');
  const updated = { ...session, accessToken };
  saveSession(updated);
  response = await send(accessToken);
  if (response.status === 401) throw new Error('SESSION_EXPIRED');
  return response;
}

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'login';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [route, setRoute] = useState(currentRoute);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  // fix(issue-1): session generation counter — incremented on logout so that
  // in-flight login/catalog completions can detect they belong to a stale flow
  // and discard their writes instead of restoring a session after logout.
  const sessionGenRef = useRef(0);

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    const allowedAudit = session && AUDIT_ROLES.has(session.role);
    if (!session && route !== 'login') window.location.hash = '/login';
    else if (session && (route === 'login' || (route === 'auditoria-nacimientos' && !allowedAudit))) {
      window.location.hash = '/inicio';
    }
  }, [route, session]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setCatalogError(''); setBusy(true);
    // Capture the generation at the start of this login attempt.
    // fix(issue-1): any write below is guarded by checking this generation.
    const gen = sessionGenRef.current;
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await readPayload(response);
      if (response.status === 401) {
        throw new Error('No pudimos abrir tu rancho. Revisa tu usuario y contraseña; si sigue fallando, pide apoyo al administrador de tu asociación.');
      }
      if (!response.ok) throw new Error('No se pudo iniciar sesión. Inténtalo de nuevo en un momento.');

      const accessToken = tokenFrom(payload);
      if (!accessToken) throw new Error('El servidor no devolvió el token de acceso.');
      const data = payload.data || payload;
      const newSession: Session = {
        accessToken,
        refreshToken: String(data.refreshToken || data.refresh_token || '') || undefined,
        role: roleFrom(payload, accessToken),
        username: String((data.user as Record<string, unknown> | undefined)?.username || username.trim()),
        ranches: ranchesFrom(payload) || [],
      };

      // fix(issue-1): only commit if no logout happened since we started.
      if (gen !== sessionGenRef.current) return;
      saveSession(newSession);
      setSession(newSession); setPassword(''); setShowPassword(false); window.location.hash = '/inicio';

      if (!ranchesFrom(payload)) {
        try {
          const ranchResponse = await apiRequest('/ranches');
          if (!ranchResponse.ok) throw new Error();
          const ranches = ranchesFrom(await readPayload(ranchResponse)) || [];

          // fix(issue-1): discard if logged out while the /ranches request was in flight.
          if (gen !== sessionGenRef.current) return;

          // fix(issue-2): merge ranches into the current saved session so we
          // preserve any access token that apiRequest may have refreshed (L83-84),
          // rather than overwriting storage with the stale login-local object.
          const current = readSession();
          if (current) {
            const merged: Session = { ...current, ranches };
            saveSession(merged);
            setSession(merged);
          }
        } catch (cause) {
          if (cause instanceof Error && cause.message === 'SESSION_EXPIRED') {
            sessionStorage.removeItem(STORAGE_KEY); setSession(null); window.location.hash = '/login';
            setError('Tu sesión venció. Vuelve a entrar para consultar tus ranchos.');
          } else setCatalogError('Entraste, pero no pudimos cargar tus ranchos. Vuelve a intentarlo más tarde.');
        }
      }
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'SESSION_EXPIRED') {
        sessionStorage.removeItem(STORAGE_KEY);
        setSession(null); window.location.hash = '/login';
        setError('Tu sesión venció. Vuelve a entrar para consultar tus ranchos.');
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } finally { setBusy(false); }
  }

  function logout() {
    // fix(issue-1): bump the generation so any pending login/catalog async
    // completions belonging to the current session see a stale gen and bail out.
    sessionGenRef.current += 1;
    sessionStorage.removeItem(STORAGE_KEY); setSession(null); setPassword(''); setShowPassword(false);
    window.location.hash = '/login';
  }

  if (!session || route === 'login') {
    return (
      <div className="login-shell">
        <header className="login-topbar">
          <div className="login-topbar-brand">
            BaaPP <span>OviApp · Portal Web</span>
          </div>
          <span className="login-topbar-context">Gestión Ganadera Ovina</span>
        </header>
        <main className="login-page">
          <form className="login-card" onSubmit={handleLogin}>
            <div className="login-card-header">
              <p className="eyebrow">Acceso al portal</p>
              <h1>Iniciar sesión</h1>
              <p className="intro">
                Ingresa con tu cuenta de productor, técnico o asociación para consultar el rebaño.
              </p>
            </div>
            <div className="login-card-body">
              <div className="field">
                <label htmlFor="username">Usuario</label>
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="Ej. rancho.sauces"
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Contraseña</label>
                <div className="password-row">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Validando credenciales…' : 'Entrar al portal'}
              </button>
            </div>
            <div className="login-card-footer">
              <span className="security-status">
                <span className="security-dot" aria-hidden="true" />
                Acceso seguro HTTPS
              </span>
              <span>AGLOT · Pelifolk · SADER</span>
            </div>
          </form>
        </main>
      </div>
    );
  }

  const isAudit = route === 'auditoria-nacimientos';
  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#/inicio">
          <strong>BaaPP (OviApp)</strong>
          <span>Portal de Rancho y Asociación</span>
        </a>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <p className="sidebar-label">Módulos</p>
          <a className={!isAudit ? 'nav-link active' : 'nav-link'} href="#/inicio">
            Inicio
          </a>
          {AUDIT_ROLES.has(session.role) && (
            <a className={isAudit ? 'nav-link active' : 'nav-link'} href="#/auditoria-nacimientos">
              Bandeja de auditoría
            </a>
          )}
        </nav>
      </aside>
      <div className="portal-main">
        <header className="topbar">
          <span className="topbar-title">
            {isAudit ? 'Bandeja de auditoría de nacimientos' : 'Panel principal'}
          </span>
          <div className="account">
            <span>{session.username}</span>
            <span className="role-badge">{session.role || 'USUARIO'}</span>
            <button className="secondary-button" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="content">
          <p className="eyebrow">{isAudit ? 'Acceso por rol' : 'Portal BaaPP'}</p>
          <h1>
            {isAudit
              ? 'Bandeja de auditoría de nacimientos'
              : `Bienvenido${session.username ? `, ${session.username}` : ''}`}
          </h1>
          {isAudit ? (
            <p className="intro">
              Tu rol tiene acceso a esta sección. La consulta de auditorías se incorpora en su requisito funcional correspondiente.
            </p>
          ) : (
            <>
              <p className="intro">
                Sesión iniciada correctamente. Los ranchos autorizados para tu cuenta quedaron guardados para esta visita.
              </p>
              {catalogError && (
                <p className="error" role="status">
                  {catalogError}
                </p>
              )}
              <div className="summary-card">
                <span className="summary-number">{session.ranches.length}</span>
                <div>
                  <strong>Ranchos disponibles</strong>
                  <span>
                    {session.ranches.length === 1
                      ? 'rancho autorizado para tu cuenta'
                      : 'ranchos autorizados para tu cuenta'}
                  </span>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
