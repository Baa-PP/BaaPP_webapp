import { FormEvent, Suspense, lazy, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, clearSession, getSessionGeneration, onForbiddenError, onSessionCleared, onSessionRefreshed, postAuthEndpoint, type ApiError, type ForbiddenEvent } from './api/client';
import { API_CONFIG_ERROR, API_IS_HTTPS } from './api/config';
import { RanchContextNotice } from './components/RanchContextNotice';
import { BirthsView } from './features/births/BirthsView';
import { AnimalCertificate, normalizeAnimalDetail } from './features/inventory/AnimalCertificate';
import { InventoryView } from './features/inventory/InventoryView';
import { RanchProfileForm } from './features/ranch/RanchProfileForm';
import { WorkerManagement } from './features/workers/WorkerManagement';
import { useRanchContextStore, type Ranch } from './store/useRanchContextStore';

const ReproductiveAnalyticsView = lazy(() =>
  import('./features/analytics/ReproductiveAnalyticsView').then((mod) => ({
    default: mod.ReproductiveAnalyticsView,
  }))
);
const MortalityWeaningView = lazy(() =>
  import('./features/analytics/MortalityWeaningView').then((mod) => ({
    default: mod.MortalityWeaningView,
  }))
);
const GrowthAnalyticsView = lazy(() =>
  import('./features/analytics/GrowthAnalyticsView').then((mod) => ({
    default: mod.GrowthAnalyticsView,
  }))
);
const PendingWeaningsView = lazy(() =>
  import('./features/analytics/PendingWeaningsView').then((mod) => ({
    default: mod.PendingWeaningsView,
  }))
);
const UnproductiveFemalesView = lazy(() =>
  import('./features/analytics/UnproductiveFemalesView').then((mod) => ({
    default: mod.UnproductiveFemalesView,
  }))
);
const SabanaView = lazy(() =>
  import('./features/sabana/SabanaView').then((mod) => ({
    default: mod.SabanaView,
  }))
);

type Session={accessToken:string;refreshToken?:string;role:string;username:string;ranches:Ranch[];permissions?:Record<string,any>;activeRanchId?:string};
const KEY='baapp.session',AUDIT=['ASSOCIATION_SUPERUSER','VET_TECHNICIAN'],RANCH_EDIT_ROLES=['OWNER','ASSOCIATION_SUPERUSER','VET_TECHNICIAN'];
const data=(p:any)=>p?.data??p,token=(p:any)=>String(data(p).accessToken||data(p).access_token||data(p).token||data(p).jwt||'');
const payload=async(r:Response)=>{try{return await r.json()}catch{return {}}};
const route=()=>location.hash.replace(/^#\/?/,'')||'inventario';
const formatDateTime=(s?:string)=>{if(!s)return 'Sin sincronización';const d=new Date(s);return isNaN(d.getTime())?s:new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
const hasValidSync=(s?:string)=>Boolean(s&&!isNaN(new Date(s).getTime()));
const canInventory=(s:Session)=>s.role!=='WORKER_BRANCH'||s.permissions?.read_inventory===true||s.permissions?.lectura===true||s.permissions?.inventory===true||s.permissions?.inventory?.read===true;
const canSabana=(s:Session)=>s.role!=='WORKER_BRANCH'||s.permissions?.exportacion===true||s.permissions?.export===true||s.permissions?.sabana===true;
const canAnalytics=(s:Session)=>s.role!=='WORKER_BRANCH'||s.permissions?.read_inventory===true||s.permissions?.lectura===true||s.permissions?.analytics===true||s.permissions?.analytics?.read===true||s.permissions?.inventory===true||s.permissions?.inventory?.read===true;
const canEditRanch=(s:Session)=>RANCH_EDIT_ROLES.includes(s.role);
const canManageWorkers=(s:Session)=>s.role==='OWNER';
const canViewBirths=(s:Session)=>AUDIT.includes(s.role)||s.role==='OWNER';
const defaultRoute=(s:Session)=>canInventory(s)?'/inventario':canSabana(s)?'/sabana':canAnalytics(s)?'/indicadores':'/sin-permisos';

function normalizeRanches(p:any):Ranch[]{
  const d=data(p);
  const raw=[
    Array.isArray(p)?p:undefined,
    p?.ranches,p?.accessibleRanches,p?.accessible_ranches,
    p?.data?.ranches,p?.data?.accessibleRanches,p?.data?.accessible_ranches,
    p?.data?.content,p?.content,
    Array.isArray(p?.data)?p.data:undefined,
    d?.ranches,d?.accessibleRanches,d?.accessible_ranches,d?.user?.ranches,
    Array.isArray(d)?d:undefined,
  ].find(Array.isArray)||[];
  return raw
    .map((item:any,idx:number)=>{
      const id=String(item?.id??item?.ranchId??item?.ranch_id??'').trim();
      if(!id)return null;
      return {
        id,
        name:String(item?.name??item?.ranchName??item?.ranch_name??`Rancho ${idx+1}`),
        address:item?.address??item?.domicilio,
        owner_name:item?.owner??item?.owner_name??item?.ownerName??item?.propietario,
        weaning_days_target:item?.weaningTargetDays??item?.weaning_days_target??item?.weaningDaysTarget,
        last_sync_at:item?.lastSyncedAt??item?.last_sync_at??item?.lastSyncAt??item?.ultima_sincronizacion,
      } as Ranch;
    })
    .filter((r:Ranch|null):r is Ranch=>r!==null);
}

function read():Session|null{
  try{
    const parsed=JSON.parse(sessionStorage.getItem(KEY)||'null');
    if(!parsed||typeof parsed.accessToken!=='string')return null;
    const normalizedRanches=normalizeRanches(parsed.ranches??parsed);
    const activeRanchId=String(parsed.activeRanchId||normalizedRanches[0]?.id||'').trim()||undefined;
    return {...parsed,ranches:normalizedRanches,activeRanchId};
  }catch{
    return null;
  }
}
function syncTokensToSessionStorage(session:Session,force=false){
  if(force||!sessionStorage.getItem('jwt_token')){
    sessionStorage.setItem('jwt_token',session.accessToken);
  }
  if(force){
    if(session.refreshToken)sessionStorage.setItem('jwt_refresh_token',session.refreshToken);
    else sessionStorage.removeItem('jwt_refresh_token');
  }else if(session.refreshToken&&!sessionStorage.getItem('jwt_refresh_token')){
    sessionStorage.setItem('jwt_refresh_token',session.refreshToken);
  }
}

function mergeLatestTokens(base:Session,ranchId:string|undefined):Session{
  const stored=read();
  const latestAccess=sessionStorage.getItem('jwt_token')||stored?.accessToken||base.accessToken;
  const latestRefresh=sessionStorage.getItem('jwt_refresh_token')||stored?.refreshToken||base.refreshToken;
  return {
    ...(stored&&stored.username===base.username?stored:base),
    accessToken:latestAccess,
    refreshToken:latestRefresh,
    activeRanchId:ranchId,
  };
}

const queryClient=new QueryClient({
  defaultOptions:{
    queries:{
      retry:(failureCount,error)=>{
        const status=(error as Partial<ApiError>|null)?.status;
        if(status===400||status===401||status===403||status===404)return false;
        return failureCount<1;
      },
      refetchOnWindowFocus:false,
    },
  },
});

export default function App(){
  return (
    <QueryClientProvider client={queryClient}>
      <PortalApp/>
    </QueryClientProvider>
  );
}

function PortalApp(){
  const qc=useQueryClient();
  const {activeRanchId,availableRanches,setActiveRanchId,setAvailableRanches}=useRanchContextStore();
  const [s,setS]=useState<Session|null>(read),[url,setUrl]=useState(route),[user,setUser]=useState(''),[pass,setPass]=useState(''),[showPassword,setShowPassword]=useState(false),[loginErr,setLoginErr]=useState(''),[busy,setBusy]=useState(false),[forbiddenAlert,setForbiddenAlert]=useState<ForbiddenEvent|null>(null);

  useEffect(()=>{const u=()=>setUrl(route());addEventListener('hashchange',u);return()=>removeEventListener('hashchange',u)},[]);

  // Sync persisted session into sessionStorage (for apiFetch) and useRanchContextStore
  useEffect(()=>{
    if(!s){
      setAvailableRanches([]);
      setActiveRanchId(null);
      return;
    }
    syncTokensToSessionStorage(s,false);
    if(s.ranches.length>0){
      setAvailableRanches(s.ranches);
    }
    if(s.activeRanchId){
      setActiveRanchId(s.activeRanchId);
    }
  },[s?.username]);

  // Keep sessionStorage activeRanchId synchronized with store changes without overwriting refreshed tokens
  useEffect(()=>{
    if(!s)return;
    const nextRanchId=useRanchContextStore.getState().activeRanchId??undefined;
    const persistedRanchId=read()?.activeRanchId;
    if(persistedRanchId===nextRanchId)return;
    const updated=mergeLatestTokens(s,nextRanchId);
    sessionStorage.setItem(KEY,JSON.stringify(updated));
  },[activeRanchId,s]);

  // Keep React state synchronized when WEB-002 apiFetch refreshes/expires the session or BE-002 rejects 403
  useEffect(()=>{
    const unsubCleared=onSessionCleared(()=>{
      setAvailableRanches([]);
      qc.clear();
      setS(null);
      setPass('');
      setShowPassword(false);
      setForbiddenAlert(null);
      if(location.hash!=='#/login')location.hash='/login';
    });
    const unsubRefreshed=onSessionRefreshed(({accessToken,refreshToken})=>{
      setS(prev=>prev?{...prev,accessToken,refreshToken:refreshToken??prev.refreshToken}:null);
    });
    const unsubForbidden=onForbiddenError((event)=>{
      setForbiddenAlert(event);
    });
    return()=>{unsubCleared();unsubRefreshed();unsubForbidden()};
  },[qc,setAvailableRanches]);
  // Route guard (WEB-004)
  useEffect(()=>{
    if(!s){
      if(url!=='login')location.hash='/login';
      return;
    }
    if(url==='login'){
      location.hash=defaultRoute(s);
      return;
    }
    if(url==='auditoria-nacimientos'&&!AUDIT.includes(s.role)){
      location.hash=defaultRoute(s);
      return;
    }
    if((url==='indicadores'||url==='mortalidad-destete'||url==='crecimiento'||url==='destetes-pendientes'||url==='vientres-improductivos')&&!canAnalytics(s)){
      location.hash=defaultRoute(s);
      return;
    }
    if(url==='partos'&&!canViewBirths(s)){
      location.hash=defaultRoute(s);
      return;
    }
    if(url==='rancho'&&!canEditRanch(s)){
      location.hash=defaultRoute(s);
      return;
    }
    if(url==='sabana'&&!canSabana(s)){
      location.hash=defaultRoute(s);
      return;
    }
    if(url==='cuentas-rama'&&!canManageWorkers(s)){
      location.hash=defaultRoute(s);
      return;
    }
    const isInventario=url==='inventario'||url.startsWith('inventario/');
    const isKnown=isInventario||url==='sabana'||url==='sin-permisos'||url==='auditoria-nacimientos'||url==='partos'||url==='indicadores'||url==='mortalidad-destete'||url==='crecimiento'||url==='destetes-pendientes'||url==='vientres-improductivos'||url==='rancho'||url==='cuentas-rama';
    if(!isKnown){
      location.hash=defaultRoute(s);
      return;
    }
    if(isInventario&&!canInventory(s)){
      location.hash=canSabana(s)?'/sabana':canAnalytics(s)?'/indicadores':'/sin-permisos';
    }
  },[s,url]);

  const multi=Boolean(s&&AUDIT.includes(s.role));
  const canEdit=Boolean(s&&canEditRanch(s));
  const canWorkers=Boolean(s&&canManageWorkers(s));
  const canViewSabana=Boolean(s&&canSabana(s));
  const canViewAnalytics=Boolean(s&&canAnalytics(s));
  const detail=url.startsWith('inventario/');
  const detailId=detail?url.slice(11):'';
  const isInventoryRoute=Boolean(s&&canInventory(s)&&!['login','sabana','sin-permisos','auditoria-nacimientos','partos','indicadores','mortalidad-destete','crecimiento','destetes-pendientes','vientres-improductivos','rancho','cuentas-rama'].includes(url));
  const isBirthsRoute=Boolean(s&&((url==='auditoria-nacimientos'&&AUDIT.includes(s.role))||(url==='partos'&&canViewBirths(s))));

  // WEB-005 / WEB-006: Load accessible ranch(es) from GET /api/v1/ranches (BE-004), independent of active ranch
  const ranchesQuery=useQuery({
    queryKey:['ranches',s?.username],
    queryFn:async()=>{
      const p=await apiFetch<unknown>('/ranches',{ranchId:null});
      return normalizeRanches(p);
    },
    enabled:Boolean(s),
  });

  useEffect(()=>{
    if(!ranchesQuery.data)return;
    setAvailableRanches(ranchesQuery.data);
  },[ranchesQuery.data,setAvailableRanches]);

  // Individual animal detail query (keyed by activeRanchId + detailId, passes key's ranchId into apiFetch)
  const animalQuery=useQuery({
    queryKey:['animal',s?.username,activeRanchId,detailId] as const,
    queryFn:async({queryKey})=>{
      const ranchId=queryKey[2];
      const p=await apiFetch<unknown>('/animals/'+encodeURIComponent(detailId),{ranchId:ranchId??undefined});
      return normalizeAnimalDetail(p);
    },
    enabled:Boolean(isInventoryRoute&&detail&&detailId&&activeRanchId),
  });

  function handleRanchChange(ranchId:string){
    const nextId=ranchId||null;
    setForbiddenAlert(null);
    setActiveRanchId(nextId);
    if(s){
      const updated=mergeLatestTokens(s,nextId??undefined);
      setS(updated);
      sessionStorage.setItem(KEY,JSON.stringify(updated));
    }
    // WEB-005: invalidate all queries so every view refreshes for the new ranch without re-login
    qc.invalidateQueries();
  }

  function handleRanchSaved(updated:Ranch){
    const {availableRanches:currentList,activeRanchId:currentActiveId}=useRanchContextStore.getState();
    const exists=currentList.some(r=>r.id===updated.id);
    const nextList=exists
      ?currentList.map(r=>r.id===updated.id?{...r,...updated}:r)
      :[...currentList,updated];
    setAvailableRanches(nextList);
    if(s){
      const merged=mergeLatestTokens(s,currentActiveId??updated.id);
      const nextSession:Session={...merged,ranches:nextList};
      setS(nextSession);
      sessionStorage.setItem(KEY,JSON.stringify(nextSession));
    }
    qc.invalidateQueries({queryKey:['ranches']});
    qc.invalidateQueries({queryKey:['analytics']});
  }

  async function login(e:FormEvent){
    e.preventDefault();setBusy(true);setLoginErr('');
    const startGen=getSessionGeneration();
    try{
      const r=await postAuthEndpoint('/auth/login',{username:user.trim(),password:pass}),p=await payload(r);
      if(!r.ok)throw Error(r.status===401?'No pudimos abrir tu rancho. Revisa tu usuario y contraseña; si sigue fallando, pide apoyo al administrador de tu asociación.':'No se pudo iniciar sesión. Inténtalo de nuevo en un momento.');
      const d=data(p),t=token(p),u=d.user||{};
      if(!t)throw Error('El servidor no devolvió el token de acceso.');
      if(getSessionGeneration()!==startGen)return;
      let role=String(u.role||d.role||'');
      try{if(!role)role=String(JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role||'')}catch{}
      role=role.toUpperCase().replace(/^ROLE_/,'');
      const initialRanches=normalizeRanches(p);
      const n:Session={accessToken:t,refreshToken:String(d.refreshToken||d.refresh_token||'')||undefined,role,username:String(u.username||d.username||user.trim()),ranches:initialRanches,permissions:u.branch_permissions||u.permissions||d.branch_permissions||d.permissions,activeRanchId:String(u.ranchId||u.ranch_id||d.ranchId||d.ranch_id||'').trim()||undefined};
      syncTokensToSessionStorage(n,true);
      if(AUDIT.includes(role)&&!n.ranches.length){
        try{n.ranches=normalizeRanches(await apiFetch<unknown>('/ranches',{ranchId:null}))}catch{}
      }
      if(getSessionGeneration()!==startGen)return;
      if(n.ranches[0]&&!n.activeRanchId)n.activeRanchId=n.ranches[0].id;
      const persisted=mergeLatestTokens(n,n.activeRanchId);
      sessionStorage.setItem(KEY,JSON.stringify(persisted));
      qc.clear();
      if(persisted.ranches.length>0)setAvailableRanches(persisted.ranches);
      setActiveRanchId(persisted.activeRanchId||null);
      setS(persisted);setPass('');setShowPassword(false);
      location.hash=defaultRoute(persisted);
    }catch(e){
      if(getSessionGeneration()!==startGen)return;
      setLoginErr(e instanceof Error?e.message:'No se pudo iniciar sesión.');
    }finally{setBusy(false)}
  }

  function logout(){
    setForbiddenAlert(null);
    clearSession();
    location.hash='/login';
  }

  if(!s||url==='login'){
    return (
      <div className="login-shell">
        <header className="login-topbar">
          <div className="login-topbar-brand">
            BaaPP <span>OviApp · Portal Web</span>
          </div>
          <span className="login-topbar-context">Gestión Ganadera Ovina</span>
        </header>
        <main className="login-page">
          <form className="login-card" onSubmit={login}>
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
                  value={user}
                  onChange={e=>setUser(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Contraseña</label>
                <div className="password-row">
                  <input
                    id="password"
                    name="password"
                    type={showPassword?'text':'password'}
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    value={pass}
                    onChange={e=>setPass(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={()=>setShowPassword(v=>!v)}
                    aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'}
                  >
                    {showPassword?'Ocultar':'Mostrar'}
                  </button>
                </div>
              </div>
              {(API_CONFIG_ERROR||loginErr)&&(
                <p className="error" role="alert">
                  {API_CONFIG_ERROR||loginErr}
                </p>
              )}
              <button className="primary wide" type="submit" disabled={busy||Boolean(API_CONFIG_ERROR)}>
                {busy?'Validando credenciales…':'Entrar al portal'}
              </button>
            </div>
            <div className="login-card-footer">
              <span className={API_CONFIG_ERROR?'security-status warning':'security-status'}>
                <span className={API_CONFIG_ERROR?'security-dot warning':'security-dot'} aria-hidden="true" />
                {API_CONFIG_ERROR?'Conexión bloqueada (HTTPS requerido)':API_IS_HTTPS?'Acceso seguro HTTPS':'Entorno local HTTP (localhost)'}
              </span>
              <span>AGLOT · Pelifolk · SADER</span>
            </div>
          </form>
        </main>
      </div>
    );
  }

  const show=canInventory(s);
  const hasModuleAccess=show||canViewSabana||canEdit||canWorkers||canViewAnalytics||AUDIT.includes(s.role);
  const selectedRanch=activeRanchId?availableRanches.find(r=>r.id===activeRanchId)??null:null;
  const ranchSynced=hasValidSync(selectedRanch?.last_sync_at);
  const animal=animalQuery.data??null;
  const loading=animalQuery.isFetching;
  const error=animalQuery.error instanceof Error?animalQuery.error.message:'';
  const ranchesError=ranchesQuery.isError?(ranchesQuery.error instanceof Error?ranchesQuery.error.message:'No se pudieron cargar los ranchos afiliados.'):'';
  const retryRanches=()=>{void ranchesQuery.refetch()};
  const pageTitle=!hasModuleAccess||url==='sin-permisos'?'Sin módulos habilitados':url==='sabana'&&canViewSabana?'Sábana oficial (24 columnas A–X)':url==='rancho'&&canEdit?'Perfil del rancho':url==='cuentas-rama'&&canWorkers?'Cuentas rama (WORKER_BRANCH)':url==='indicadores'&&canViewAnalytics?'Indicadores reproductivos':url==='mortalidad-destete'&&canViewAnalytics?'Mortalidad y destete':url==='crecimiento'&&canViewAnalytics?'Crecimiento y ranking GDP':url==='destetes-pendientes'&&canViewAnalytics?'Tablero de destetes pendientes':url==='vientres-improductivos'&&canViewAnalytics?'Vientres improductivos (CULL / SELL)':isBirthsRoute?(multi?'Bandeja de auditoría de nacimientos':'Partos del rancho'):detail?'Reseña individual del ejemplar':'Inventario del rebaño';

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href={'#'+defaultRoute(s)}>
          <strong>BaaPP (OviApp)</strong>
          <span>Portal de Rancho y Asociación</span>
        </a>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <p className="sidebar-label">Módulos</p>
          {show&&(
            <a className={url==='inventario'||detail?'nav-link active':'nav-link'} href="#/inventario">
              Inventario y Reseña
            </a>
          )}
          {canViewSabana&&(
            <a className={url==='sabana'?'nav-link active':'nav-link'} href="#/sabana">
              Sábana Oficial (A–X)
            </a>
          )}
          {canViewAnalytics&&(
            <>
              <a className={url==='indicadores'?'nav-link active':'nav-link'} href="#/indicadores">
                Indicadores reproductivos
              </a>
              <a className={url==='mortalidad-destete'?'nav-link active':'nav-link'} href="#/mortalidad-destete">
                Mortalidad y destete
              </a>
              <a className={url==='crecimiento'?'nav-link active':'nav-link'} href="#/crecimiento">
                Crecimiento y GDP
              </a>
              <a className={url==='destetes-pendientes'?'nav-link active':'nav-link'} href="#/destetes-pendientes">
                Destetes pendientes
              </a>
              <a className={url==='vientres-improductivos'?'nav-link active':'nav-link'} href="#/vientres-improductivos">
                Vientres improductivos
              </a>
            </>
          )}
          {canEdit&&(
            <a className={url==='rancho'?'nav-link active':'nav-link'} href="#/rancho">
              Perfil del rancho
            </a>
          )}
          {canWorkers&&(
            <a className={url==='cuentas-rama'?'nav-link active':'nav-link'} href="#/cuentas-rama">
              Cuentas rama
            </a>
          )}
          {AUDIT.includes(s.role)&&(
            <a className={url==='auditoria-nacimientos'||url==='partos'?'nav-link active':'nav-link'} href="#/auditoria-nacimientos">
              Bandeja de auditoría
            </a>
          )}
          {s.role==='OWNER'&&(
            <a className={url==='partos'?'nav-link active':'nav-link'} href="#/partos">
              Partos del rancho
            </a>
          )}
        </nav>
      </aside>
      <div className="portal-main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div className="ranch-bar" aria-label="Contexto del rancho activo">
            {multi&&(
              <div className="ranch-control">
                <label className="ranch">
                  <span>Rancho activo</span>
                  <select
                    aria-label="Rancho activo"
                    value={activeRanchId??''}
                    disabled={ranchesQuery.isLoading&&availableRanches.length===0}
                    onChange={e=>handleRanchChange(e.target.value)}
                  >
                    {ranchesQuery.isLoading&&availableRanches.length===0?(
                      <option value="">Cargando ranchos…</option>
                    ):availableRanches.length===0?(
                      <option value="">Sin ranchos afiliados</option>
                    ):(
                      availableRanches.map(r=>(
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {ranchesQuery.isError&&availableRanches.length===0&&(
                  <button type="button" className="link-button" onClick={()=>ranchesQuery.refetch()}>
                    Reintentar
                  </button>
                )}
              </div>
            )}
            {selectedRanch?(
              <div className="ranch-summary" aria-label="Datos del rancho seleccionado">
                <strong className="ranch-summary-name">{selectedRanch.name}</strong>
                <span className="meta-sep" aria-hidden="true">·</span>
                <span className="ranch-summary-item">
                  Propietario: <b>{selectedRanch.owner_name||'Sin dato'}</b>
                </span>
                <span className="meta-sep" aria-hidden="true">·</span>
                <span className={'ranch-sync '+(ranchSynced?'synced':'pending')}>
                  <span className="sync-dot" aria-hidden="true" />
                  Última sync móvil: <b>{formatDateTime(selectedRanch.last_sync_at)}</b>
                </span>
              </div>
            ):ranchesQuery.isLoading?(
              <span className="ranch-loading">Cargando datos del rancho…</span>
            ):(
              <div className="ranch-summary" aria-label="Datos del rancho seleccionado">
                <span className="ranch-summary-item">Datos del rancho no disponibles</span>
                {!multi&&ranchesQuery.isError&&(
                  <>
                    <span className="meta-sep" aria-hidden="true">·</span>
                    <button type="button" className="link-button" onClick={retryRanches}>
                      Reintentar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="account">
            <span className="account-user">{s.username}</span>
            <span className="role-badge">{s.role||'USUARIO'}</span>
            <button type="button" className="secondary-button" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="content">
          {API_CONFIG_ERROR&&(
            <div className="security-alert" role="alert">
              <div className="security-alert-body">
                <strong>Configuración de transporte insegura</strong>
                <p>{API_CONFIG_ERROR}</p>
              </div>
            </div>
          )}
          {forbiddenAlert&&(
            <div className="security-alert" role="alert">
              <div className="security-alert-body">
                <div className="security-alert-head">
                  <strong>Acceso denegado (403)</strong>
                  {forbiddenAlert.code&&<span className="security-code">{forbiddenAlert.code}</span>}
                </div>
                <p>{forbiddenAlert.message}</p>
                {forbiddenAlert.ranchId&&(
                  <small className="security-alert-meta">
                    Recurso: <code>{forbiddenAlert.path}</code> · Rancho solicitado: <code>{forbiddenAlert.ranchId}</code>
                  </small>
                )}
              </div>
              <div className="security-alert-actions">
                {availableRanches.some(r=>r.id!==forbiddenAlert.ranchId)&&(
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={()=>{
                      const fallback=availableRanches.find(r=>r.id!==forbiddenAlert.ranchId);
                      if(fallback)handleRanchChange(fallback.id);
                    }}
                  >
                    Volver a mi rancho
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={()=>setForbiddenAlert(null)}
                >
                  Entendido
                </button>
              </div>
            </div>
          )}
          {!hasModuleAccess||url==='sin-permisos'?(
            <section className="empty-panel">
              <p className="eyebrow">Control de acceso</p>
              <h1>Sin módulos habilitados</h1>
              <p className="intro">Tu cuenta no tiene permisos habilitados para consultar módulos del portal web.</p>
            </section>
          ):url==='sabana'&&canViewSabana?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando sábana oficial virtualizada…</p>
                </section>
              }
            >
              <SabanaView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
              />
            </Suspense>
          ):url==='indicadores'&&canViewAnalytics?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando módulo de indicadores…</p>
                </section>
              }
            >
              <ReproductiveAnalyticsView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchWeaningTargetDays={selectedRanch?.weaning_days_target}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
              />
            </Suspense>
          ):url==='mortalidad-destete'&&canViewAnalytics?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando gráficas de mortalidad y destete…</p>
                </section>
              }
            >
              <MortalityWeaningView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
              />
            </Suspense>
          ):url==='crecimiento'&&canViewAnalytics?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando curvas de peso y ranking GDP…</p>
                </section>
              }
            >
              <GrowthAnalyticsView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
                canOpenAnimalDetail={canInventory(s)}
              />
            </Suspense>
          ):url==='destetes-pendientes'&&canViewAnalytics?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando tablero de destetes pendientes…</p>
                </section>
              }
            >
              <PendingWeaningsView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchWeaningTargetDays={selectedRanch?.weaning_days_target}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
                canOpenAnimalDetail={canInventory(s)}
                canEditRanch={canEdit}
              />
            </Suspense>
          ):url==='vientres-improductivos'&&canViewAnalytics?(
            <Suspense
              fallback={
                <section className="empty-panel" role="status" aria-live="polite">
                  <p className="muted">Cargando tablero de vientres improductivos…</p>
                </section>
              }
            >
              <UnproductiveFemalesView
                username={s.username}
                multiRanch={multi}
                activeRanchId={activeRanchId}
                ranchName={selectedRanch?.name}
                ranchesLoading={ranchesQuery.isFetching}
                ranchesError={ranchesError}
                onRetryRanches={retryRanches}
                canOpenAnimalDetail={canInventory(s)}
              />
            </Suspense>
          ):url==='rancho'&&canEdit?(
            <RanchProfileForm
              ranch={selectedRanch}
              loading={ranchesQuery.isFetching}
              error={ranchesQuery.isError?(ranchesQuery.error instanceof Error?ranchesQuery.error.message:'No se pudo cargar el perfil del rancho.'):''}
              onRetry={()=>{void ranchesQuery.refetch()}}
              onSaved={handleRanchSaved}
            />
          ):url==='cuentas-rama'&&canWorkers?(
            <WorkerManagement
              ranchId={activeRanchId??selectedRanch?.id??null}
              ranchName={selectedRanch?.name}
              ranchLoading={ranchesQuery.isFetching}
              ranchError={ranchesQuery.isError?(ranchesQuery.error instanceof Error?ranchesQuery.error.message:'No se pudo cargar la información del rancho.'):''}
              onRetryRanch={()=>{void ranchesQuery.refetch()}}
            />
          ):isBirthsRoute?(
            <BirthsView
              username={s.username}
              userRole={s.role}
              multiRanch={multi}
              activeRanchId={activeRanchId}
              ranchName={selectedRanch?.name}
              ranchesLoading={ranchesQuery.isFetching}
              ranchesError={ranchesError}
              onRetryRanches={retryRanches}
            />
          ):detail?(
            <>
              <a className="back-button" href="#/inventario">
                ← Volver al inventario
              </a>
              {!activeRanchId?(
                <RanchContextNotice
                  eyebrow="Reseña del ejemplar"
                  multiRanch={multi}
                  loading={ranchesQuery.isFetching}
                  error={ranchesError}
                  onRetry={retryRanches}
                />
              ):loading&&!animal?(
                <p className="muted">Cargando reseña del ejemplar…</p>
              ):error?(
                <section className="empty-panel detail-error-panel">
                  <p className="error" role="alert">{error}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={loading}
                    onClick={()=>{void animalQuery.refetch()}}
                  >
                    {loading?'Reintentando…':'Reintentar'}
                  </button>
                </section>
              ):animal&&(
                <AnimalCertificate
                  animal={animal}
                  activeRanchId={activeRanchId}
                  activeRanchOwner={selectedRanch?.owner_name}
                />
              )}
            </>
          ):show?(
            <InventoryView
              username={s.username}
              multiRanch={multi}
              activeRanchId={activeRanchId}
              ranchName={selectedRanch?.name}
              ranchesLoading={ranchesQuery.isFetching}
              ranchesError={ranchesError}
              onRetryRanches={retryRanches}
            />
          ):null}
        </main>
      </div>
    </div>
  );
}
