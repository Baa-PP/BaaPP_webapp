import { FormEvent, useEffect, useState } from 'react';

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

function ranchesFrom(payload: ApiPayload): Ranch[] | undefined {
  const candidates = [payload.ranches, payload.accessibleRanches, payload.accessible_ranches,
    payload.data?.ranches, payload.data?.accessibleRanches, payload.data?.accessible_ranches,
    payload.data?.content, payload.content];
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogError, setCatalogError] = useState('');

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
      const session: Session = {
        accessToken,
        refreshToken: String(data.refreshToken || data.refresh_token || '') || undefined,
        role: roleFrom(payload, accessToken),
        username: String((data.user as Record<string, unknown> | undefined)?.username || username.trim()),
        ranches: ranchesFrom(payload) || [],
      };
      saveSession(session);
      setSession(session); setPassword(''); window.location.hash = '/inicio';

      if (!ranchesFrom(payload)) {
        try {
          const ranchResponse = await apiRequest('/ranches');
          if (!ranchResponse.ok) throw new Error();
          session.ranches = ranchesFrom(await readPayload(ranchResponse)) || [];
          saveSession(session); setSession({ ...session });
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
    sessionStorage.removeItem(STORAGE_KEY); setSession(null); setPassword('');
    window.location.hash = '/login';
  }

  if (!session || route === 'login') {
    return <main className="login-page"><form className="login-card" onSubmit={handleLogin}>
      <div className="brand-mark">BAAP <span>PORTAL DE RANCHO</span></div>
      <p className="eyebrow">Gestión ovina, en orden</p>
      <h1>Qué gusto verte</h1>
      <p className="intro">Entra para consultar la información de tu rancho.</p>
      <label htmlFor="username">Usuario</label>
      <input id="username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required />
      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Revisando tus datos…' : 'Entrar al portal'}</button>
      <p className="security-note">Tu acceso se valida de forma segura con BaaP.</p>
    </form></main>;
  }

  const isAudit = route === 'auditoria-nacimientos';
  return <div className="portal-shell">
    <header className="topbar"><a className="brand-mark" href="#/inicio">BAAP <span>PORTAL DE RANCHO</span></a>
      <div className="account"><span>{session.username}</span><span className="role-pill">{session.role || 'USUARIO'}</span><button className="text-button" onClick={logout}>Salir</button></div>
    </header>
    <div className="portal-layout"><aside className="sidebar"><p className="eyebrow">MENÚ</p>
      <a className={!isAudit ? 'nav-link active' : 'nav-link'} href="#/inicio">Inicio</a>
      {AUDIT_ROLES.has(session.role) && <a className={isAudit ? 'nav-link active' : 'nav-link'} href="#/auditoria-nacimientos">Bandeja de auditoría de nacimientos</a>}
    </aside><main className="content"><p className="eyebrow">{isAudit ? 'ACCESO POR ROL' : 'PORTAL BaaP'}</p>
      <h1>{isAudit ? 'Bandeja de auditoría de nacimientos' : `Bienvenido${session.username ? `, ${session.username}` : ''}`}</h1>
      {isAudit
        ? <p className="intro">Tu rol tiene acceso a esta sección. La consulta de auditorías se incorpora en su requisito funcional correspondiente.</p>
        : <><p className="intro">Ya estás dentro. Tu sesión y los ranchos disponibles quedaron guardados para esta visita.</p>
          {catalogError && <p className="error" role="status">{catalogError}</p>}
          <div className="summary-card"><span className="summary-number">{session.ranches.length}</span><span>rancho{session.ranches.length === 1 ? '' : 's'} disponible{session.ranches.length === 1 ? '' : 's'} para tu cuenta</span></div></>}
    </main></div>
  </div>;
}


