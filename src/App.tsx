import { FormEvent, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, clearSession, getSessionGeneration, onSessionCleared, onSessionRefreshed } from './api/client';
import { API_BASE_URL } from './api/config';
import { useRanchContextStore, type Ranch } from './store/useRanchContextStore';

type Animal={id:string;folio_interno?:string;siniiga_chip?:string;chip_siniiga?:string;registro_uno?:string;adn?:string;sex?:string;life_stage?:string;reproductive_status?:string;status?:string;breed?:string;raza?:string;birth_date?:string;fecha_nacimiento?:string;criador_name?:string;owner_name?:string;ranch_name?:string;photo_url?:string;presigned_photo_url?:string;photo_presigned_url?:string;mortality_date?:string;mortality_cause?:string;life_stage_at_death?:string;sale_date?:string;sale_cause?:string;sale_reason?:string;measurements?:Measure[];weight_measurements?:Measure[];pesajes?:Measure[];sire_name?:string;padre_name?:string;padre?:string;sire?:string;sire_uno?:string;folio_uno_padre?:string;sire_folio?:string;dam_name?:string;madre_name?:string;madre?:string;dam?:string;dam_uno?:string;folio_uno_madre?:string;dam_folio?:string;conception_method?:string;metodo_concepcion?:string;birth_type?:string;tipo_parto?:string;[key:string]:any};
type Measure={milestone?:string;hito?:string;weight_kg?:number;peso_kg?:number;measured_at?:string;fecha?:string;scrotal_circumference_cm?:number;circunferencia_escrotal_cm?:number};
type Session={accessToken:string;refreshToken?:string;role:string;username:string;ranches:Ranch[];permissions?:Record<string,any>;activeRanchId?:string};
const KEY='baapp.session',AUDIT=['ASSOCIATION_SUPERUSER','VET_TECHNICIAN'];
const names:Record<string,string>={FEMALE:'Hembra',MALE:'Macho',LAMB_LACTATING:'Cordero lactante',LAMB_FATTENING:'Cordero en engorda',EWE_REPLACEMENT:'Reemplazo',ADULT:'Adulto',EMPTY:'Vacía',PREGNANT:'Gestante',LACTATING:'Lactante',STUD_RAM:'Semental',ACTIVE:'Activo',SOLD:'Vendido',DECEASED:'Fallecido',BIRTH:'Nacimiento',WEANING:'Destete',DAY_120:'120 días',DAY_150:'150 días',EVALUATION:'Evaluación',MN:'Monta natural',IA:'Inseminación artificial',TE:'Transferencia de embriones',SIMPLE:'Parto simple',DOBLE:'Parto doble',TRIPLE:'Parto triple'};
const stages=['LAMB_LACTATING','LAMB_FATTENING','EWE_REPLACEMENT','ADULT'],repro=['EMPTY','PREGNANT','LACTATING','STUD_RAM'],states=['ACTIVE','SOLD','DECEASED'];
const label=(x?:string)=>x?names[x]||x.replace(/_/g,' ').toLowerCase():'—',data=(p:any)=>p?.data??p,token=(p:any)=>String(data(p).accessToken||data(p).access_token||data(p).token||data(p).jwt||'');
const payload=async(r:Response)=>{try{return await r.json()}catch{return {}}},rows=(p:any):Animal[]=>{const d=data(p);return Array.isArray(d)?d:(d.animals||d.content||d.items||d.results||[])};
const route=()=>location.hash.replace(/^#\/?/,'')||'inventario',date=(s?:string)=>{if(!s)return '—';const d=new Date(s+(s.length===10?'T00:00:00':''));return isNaN(d.getTime())?s:new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'}).format(d)};
const formatDateTime=(s?:string)=>{if(!s)return 'Sin sincronización';const d=new Date(s);return isNaN(d.getTime())?s:new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
const hasValidSync=(s?:string)=>Boolean(s&&!isNaN(new Date(s).getTime()));
const age=(s?:string)=>{if(!s)return '—';const b=new Date(s+'T00:00:00');if(isNaN(b.getTime()))return '—';const n=new Date();let m=(n.getFullYear()-b.getFullYear())*12+n.getMonth()-b.getMonth(),a=new Date(b);a.setMonth(b.getMonth()+m);if(n<a)m--;a=new Date(b);a.setMonth(b.getMonth()+m);return m+' meses, '+Math.max(0,Math.floor((n.getTime()-a.getTime())/86400000))+' días'};
const canInventory=(s:Session)=>s.role!=='WORKER_BRANCH'||s.permissions?.read_inventory===true||s.permissions?.inventory===true||s.permissions?.inventory?.read===true;
const list=(a:Animal)=>a.measurements||a.weight_measurements||a.pesajes||[],hit=(m:Measure)=>String(m.milestone||m.hito||'').toUpperCase(),kg=(m:Measure)=>Number(m.weight_kg??m.peso_kg);
const qs=(f:Record<string,string>)=>{const q=new URLSearchParams();Object.entries(f).forEach(([k,v])=>v&&q.set(k,v));return q.size?'?'+q.toString():''};

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
      retry:1,
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
  const [s,setS]=useState<Session|null>(read),[url,setUrl]=useState(route),[user,setUser]=useState(''),[pass,setPass]=useState(''),[showPassword,setShowPassword]=useState(false),[loginErr,setLoginErr]=useState(''),[busy,setBusy]=useState(false);
  const empty={folio_interno:'',siniiga_chip:'',registro_uno:'',sex:'',life_stage:'',reproductive_status:'',breed:'',status:''},[filters,setFilters]=useState(empty),[applied,setApplied]=useState(empty);

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

  // Keep React state synchronized when WEB-002 apiFetch refreshes or expires the session
  useEffect(()=>{
    const unsubCleared=onSessionCleared(()=>{
      setAvailableRanches([]);
      qc.clear();
      setS(null);
      setPass('');
      setShowPassword(false);
      if(location.hash!=='#/login')location.hash='/login';
    });
    const unsubRefreshed=onSessionRefreshed(({accessToken,refreshToken})=>{
      setS(prev=>prev?{...prev,accessToken,refreshToken:refreshToken??prev.refreshToken}:null);
    });
    return()=>{unsubCleared();unsubRefreshed()};
  },[qc,setAvailableRanches]);

  // Route guard (WEB-004)
  useEffect(()=>{
    if(!s){
      if(url!=='login')location.hash='/login';
      return;
    }
    if(url==='login'){
      location.hash=canInventory(s)?'/inventario':'/sin-permisos';
      return;
    }
    if(url==='auditoria-nacimientos'&&!AUDIT.includes(s.role)){
      location.hash=canInventory(s)?'/inventario':'/sin-permisos';
      return;
    }
    const isInventario=url==='inventario'||url.startsWith('inventario/');
    const isKnown=isInventario||url==='sin-permisos'||url==='auditoria-nacimientos';
    if(!isKnown){
      location.hash=canInventory(s)?'/inventario':'/sin-permisos';
      return;
    }
    if(isInventario&&!canInventory(s)){
      location.hash='/sin-permisos';
    }
  },[s,url]);

  const multi=Boolean(s&&AUDIT.includes(s.role));
  const detail=url.startsWith('inventario/');
  const detailId=detail?url.slice(11):'';
  const isInventoryRoute=Boolean(s&&canInventory(s)&&!['login','sin-permisos','auditoria-nacimientos'].includes(url));

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

  // Inventory list query (keyed by activeRanchId and passes that key's ranchId into apiFetch)
  const animalsQuery=useQuery({
    queryKey:['animals',s?.username,activeRanchId,applied] as const,
    queryFn:async({queryKey})=>{
      const ranchId=queryKey[2];
      const p=await apiFetch<unknown>('/animals'+qs(applied),{ranchId});
      return rows(p);
    },
    enabled:Boolean(isInventoryRoute&&!detail&&(!multi||activeRanchId)),
  });

  // Individual animal detail query (keyed by activeRanchId + detailId, passes key's ranchId into apiFetch)
  const animalQuery=useQuery({
    queryKey:['animal',s?.username,activeRanchId,detailId] as const,
    queryFn:async({queryKey})=>{
      const ranchId=queryKey[2];
      const p=await apiFetch<unknown>('/animals/'+encodeURIComponent(detailId),{ranchId});
      return (data(p).animal||data(p)) as Animal;
    },
    enabled:Boolean(isInventoryRoute&&detail&&detailId&&(!multi||activeRanchId)),
  });

  function handleRanchChange(ranchId:string){
    const nextId=ranchId||null;
    setActiveRanchId(nextId);
    if(s){
      const updated=mergeLatestTokens(s,nextId??undefined);
      setS(updated);
      sessionStorage.setItem(KEY,JSON.stringify(updated));
    }
    // WEB-005: invalidate all queries so every view refreshes for the new ranch without re-login
    qc.invalidateQueries();
  }

  async function login(e:FormEvent){
    e.preventDefault();setBusy(true);setLoginErr('');
    const startGen=getSessionGeneration();
    try{
      const r=await fetch(`${API_BASE_URL}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({username:user.trim(),password:pass})}),p=await payload(r);
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
      location.hash=canInventory(persisted)?'/inventario':'/sin-permisos';
    }catch(e){
      if(getSessionGeneration()!==startGen)return;
      setLoginErr(e instanceof Error?e.message:'No se pudo iniciar sesión.');
    }finally{setBusy(false)}
  }

  function logout(){
    clearSession();
    setFilters(empty);
    setApplied(empty);
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
              {loginErr&&(
                <p className="error" role="alert">
                  {loginErr}
                </p>
              )}
              <button className="primary wide" type="submit" disabled={busy}>
                {busy?'Validando credenciales…':'Entrar al portal'}
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

  const show=canInventory(s);
  const selectedRanch=activeRanchId?availableRanches.find(r=>r.id===activeRanchId)??null:null;
  const ranchSynced=hasValidSync(selectedRanch?.last_sync_at);
  const animals=animalsQuery.data??[];
  const animal=animalQuery.data??null;
  const loading=detail?animalQuery.isFetching:animalsQuery.isFetching;
  const error=detail?(animalQuery.error instanceof Error?animalQuery.error.message:''):(animalsQuery.error instanceof Error?animalsQuery.error.message:'');
  const pageTitle=!show||url==='sin-permisos'?'Sin módulos habilitados':url==='auditoria-nacimientos'?'Bandeja de auditoría de nacimientos':detail?'Reseña individual del ejemplar':'Inventario del rebaño';

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href={show?'#/inventario':'#/sin-permisos'}>
          <strong>BaaPP (OviApp)</strong>
          <span>Portal de Rancho y Asociación</span>
        </a>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <p className="sidebar-label">Módulos</p>
          {show&&(
            <a className={!detail&&url!=='auditoria-nacimientos'?'nav-link active':'nav-link'} href="#/inventario">
              Inventario y Reseña
            </a>
          )}
          {AUDIT.includes(s.role)&&(
            <a className={url==='auditoria-nacimientos'?'nav-link active':'nav-link'} href="#/auditoria-nacimientos">
              Bandeja de auditoría
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
          {!show||url==='sin-permisos'?(
            <section className="empty-panel">
              <p className="eyebrow">Control de acceso</p>
              <h1>Sin módulos habilitados</h1>
              <p className="intro">Tu cuenta no tiene permisos habilitados para consultar módulos del portal web.</p>
            </section>
          ):url==='auditoria-nacimientos'?(
            <section className="empty-panel">
              <p className="eyebrow">Acceso por rol</p>
              <h1>Bandeja de auditoría de nacimientos</h1>
              <p className="intro">
                {selectedRanch
                  ?`Contexto activo: ${selectedRanch.name}. La consulta y corrección auditada se habilitará en el módulo correspondiente.`
                  :'Tu rol tiene acceso autorizado a esta sección. La consulta y corrección auditada se habilitará en el módulo correspondiente.'}
              </p>
            </section>
          ):detail?(
            <>
              <a className="back-button" href="#/inventario">
                ← Volver al inventario
              </a>
              {loading&&!animal?(
                <p className="muted">Cargando reseña del ejemplar…</p>
              ):error?(
                <p className="error" role="alert">{error}</p>
              ):animal&&<Certificate a={animal}/>}
            </>
          ):(
            <>
              <div className="title-row">
                <div>
                  <p className="eyebrow">
                    {selectedRanch?`${selectedRanch.name} · Registro individual`:'Rebaño · Registro individual'}
                  </p>
                  <h1>Inventario del rebaño</h1>
                  <p className="intro">Consulta, filtra y abre la reseña oficial certificada de cada ejemplar.</p>
                </div>
                <div className="count-card">
                  <b>{animals.length}</b>
                  <span>ejemplares</span>
                </div>
              </div>
              <form className="filters" onSubmit={e=>{e.preventDefault();setApplied({...filters})}}>
                <div className="filter-title">
                  <b>Buscar y filtrar</b>
                  <button type="button" className="link-button" onClick={()=>{setFilters(empty);setApplied(empty)}}>
                    Limpiar filtros
                  </button>
                </div>
                <div className="searches">
                  {[['folio_interno','Arete interno','Ej. 79'],['siniiga_chip','Chip SINIIGA','484…'],['registro_uno','Registro UNO','Ej. 268309MM-RP']].map(([k,n,p])=>(
                    <label key={k}>
                      {n}
                      <input placeholder={p} value={filters[k as keyof typeof empty]} onChange={e=>setFilters({...filters,[k]:e.target.value})}/>
                    </label>
                  ))}
                </div>
                <div className="facets">
                  <label>
                    Sexo
                    <select value={filters.sex} onChange={e=>setFilters({...filters,sex:e.target.value})}>
                      <option value="">Todos</option>
                      <option value="FEMALE">Hembra</option>
                      <option value="MALE">Macho</option>
                    </select>
                  </label>
                  <label>
                    Etapa de vida
                    <select value={filters.life_stage} onChange={e=>setFilters({...filters,life_stage:e.target.value})}>
                      <option value="">Todas</option>
                      {stages.map(x=><option key={x} value={x}>{label(x)}</option>)}
                    </select>
                  </label>
                  <label>
                    Estado reproductivo
                    <select value={filters.reproductive_status} onChange={e=>setFilters({...filters,reproductive_status:e.target.value})}>
                      <option value="">Todos</option>
                      {repro.map(x=><option key={x} value={x}>{label(x)}</option>)}
                    </select>
                  </label>
                  <label>
                    Raza
                    <input placeholder="Todas las razas" value={filters.breed} onChange={e=>setFilters({...filters,breed:e.target.value})}/>
                  </label>
                  <label>
                    Estado
                    <select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}>
                      <option value="">Todos</option>
                      {states.map(x=><option key={x} value={x}>{label(x)}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="primary">Aplicar filtros</button>
                </div>
              </form>
              <section className="table">
                <div className="table-head">
                  <b>Ejemplares</b>
                  <span>{loading?'Actualizando…':animals.length+' registros'}</span>
                  <small>{selectedRanch?selectedRanch.name:'Datos del rancho activo'}</small>
                </div>
                {error&&<p className="error table-error" role="alert">{error}</p>}
                {!loading&&!error&&!animals.length?(
                  <div className="empty">
                    <h3>No encontramos ejemplares</h3>
                    <p>Prueba con otros filtros o limpia la búsqueda actual.</p>
                  </div>
                ):(
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Arete interno</th>
                          <th>Identificación oficial</th>
                          <th>Sexo / Raza</th>
                          <th>Etapa y reproducción</th>
                          <th>Estado</th>
                          <th>Reseña</th>
                        </tr>
                      </thead>
                      <tbody>
                        {animals.map(a=>(
                          <tr key={a.id}>
                            <td>
                              <a className="animal-link" href={'#/inventario/'+encodeURIComponent(a.id)}>
                                {a.folio_interno||'Sin arete'}
                                <small>Nació {date(a.birth_date||a.fecha_nacimiento)}</small>
                              </a>
                            </td>
                            <td>
                              {a.siniiga_chip||a.chip_siniiga||'—'}
                              <small>UNO · {a.registro_uno||'—'}</small>
                            </td>
                            <td>
                              <span className={'sex'+(a.sex==='FEMALE'?' female':a.sex==='MALE'?' male':'')}>
                                {a.sex==='FEMALE'?'♀ Hembra':a.sex==='MALE'?'♂ Macho':'Sin dato'}
                              </span>
                              <small>{a.breed||a.raza||'Raza sin especificar'}</small>
                            </td>
                            <td>
                              {label(a.life_stage)}
                              <small>{label(a.reproductive_status)}</small>
                            </td>
                            <td>
                              <span className={'state '+String(a.status||'').toLowerCase()}>
                                {label(a.status)}
                              </span>
                            </td>
                            <td>
                              <a className="open" aria-label="Abrir reseña" href={'#/inventario/'+encodeURIComponent(a.id)}>
                                Ver →
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Certificate({a}:{a:Animal}){
  const female=a.sex==='FEMALE',ms=list(a),photo=a.presigned_photo_url||a.photo_presigned_url||a.photo_url||a.photoUrl;
  const gRaw=ms
    .map(m=>({w:kg(m),t:new Date(m.measured_at||m.fecha||'').getTime()}))
    .filter(x=>Number.isFinite(x.w)&&Number.isFinite(x.t))
    .sort((x,y)=>x.t-y.t);
  const g=gRaw.slice(1).reduce<number[]>((acc,m,i)=>{
    const d=(m.t-gRaw[i].t)/86400000;
    if(Number.isFinite(d)&&d>0)acc.push((m.w-gRaw[i].w)/d);
    return acc;
  },[]);
  const milestones=['BIRTH','WEANING','DAY_120','DAY_150','EVALUATION'];
  const sire=a.sire_name||a.padre_name||a.padre||a.sire;
  const sireUno=a.sire_uno||a.folio_uno_padre||a.sire_folio||a.padre_folio;
  const dam=a.dam_name||a.madre_name||a.madre||a.dam;
  const damUno=a.dam_uno||a.folio_uno_madre||a.dam_folio||a.madre_folio;
  const conception=a.conception_method||a.metodo_concepcion;
  const birthType=a.birth_type||a.tipo_parto;
  const hasGenealogy=Boolean(sire||sireUno||dam||damUno||conception||birthType);

  const getX=(i:number)=>g.length===1?300:(i*600)/Math.max(1,g.length-1);
  const getY=(v:number)=>120-((v-Math.min(...g,0))/(Math.max(...g,0.01)-Math.min(...g,0)||1))*100;

  return <article className={'certificate '+(female?'pink':'blue')}><div className="cert-head"><div><small>BAAPP (OVIAPP) · REGISTRO DE REBAÑO</small><h1>Reseña individual</h1><p>Certificado oficial de identificación y seguimiento</p></div><div className="seal"><b>{female?'♀ HEMBRA':'♂ MACHO'}</b><small>{female?'HOJA ROSA':'HOJA AZUL'}</small></div></div>{a.status==='DECEASED'||a.status==='SOLD'?<div className="life-alert"><b>{label(a.status)} · Fecha {date(a.mortality_date||a.sale_date)}</b><span>Causa: {a.mortality_cause||a.sale_cause||a.sale_reason||'No especificada'} · Etapa: {label(a.status==='DECEASED'?a.life_stage_at_death:a.life_stage)}</span></div>:null}
  <div className="cert-body"><div className="photo">{photo?<img src={photo} alt={'Fotografía de '+(a.folio_interno||'ejemplar')}/>:<span>◉<small>Fotografía de S3</small></span>}</div><div><small className="section-label">IDENTIFICACIÓN OFICIAL</small><div className="id-grid">{[['Folio Registro UNO',a.registro_uno],['Chip SINIIGA',a.siniiga_chip||a.chip_siniiga],['Arete interno',a.folio_interno],['ADN',a.adn],['Fecha de nacimiento',date(a.birth_date||a.fecha_nacimiento)],['Edad actual',age(a.birth_date||a.fecha_nacimiento)]].map(([k,v])=><div key={k}><small>{k}</small><b>{v||'—'}</b></div>)}</div><div className="owners"><div><small>Criador · rancho de nacimiento</small><b>{a.criador_name||'Sin dato'}</b></div><div><small>Propietario actual · dueño vigente</small><b>{a.owner_name||a.ranch_name||'Sin dato'}</b></div></div><div className="genealogy-block"><small className="section-label">GENEALOGÍA</small>{hasGenealogy?<div className="id-grid"><div><small>Semental</small><b>{sire||'—'}{sireUno?` (UNO: ${sireUno})`:''}</b></div><div><small>Madre (Vientre)</small><b>{dam||'—'}{damUno?` (UNO: ${damUno})`:''}</b></div>{conception&&<div><small>Concepción</small><b>{label(conception)}</b></div>}{birthType&&<div><small>Tipo de parto</small><b>{label(birthType)}</b></div>}</div>:<p className="muted genealogy-empty">Sin datos genealógicos registrados</p>}</div></div></div><div className="badges"><span>● {label(a.sex)}</span><span>◇ {a.breed||a.raza||'Raza sin especificar'}</span><span>◷ {label(a.life_stage)}</span><span>♡ {label(a.reproductive_status)}</span></div>
  <section className="cert-section"><div className="section-title"><div><h2>Historial de pesajes</h2><small>Control de crecimiento por etapa</small></div><small>PESO · KG</small></div><div className="weights">{milestones.map(k=>{const m=ms.find(x=>hit(x)===k);return <div key={k}><small>{label(k)}</small><b>{m?kg(m).toFixed(1)+' kg':'—'}</b><small>{m?date(m.measured_at||m.fecha):'Sin registro'}</small></div>})}</div>{!female&&<p className="scrotal">♂ Circunferencia escrotal: <b>{ms.find(m=>m.scrotal_circumference_cm||m.circunferencia_escrotal_cm)?.scrotal_circumference_cm||ms.find(m=>m.circunferencia_escrotal_cm)?.circunferencia_escrotal_cm||'—'} cm</b></p>}</section>
  <section className="cert-section"><div className="section-title"><div><h2>Ganancia diaria de peso</h2><small>GDP · kg por día entre pesajes</small></div></div>{g.length?<div className="chart"><svg viewBox="0 0 600 140" role="img" aria-label="Gráfica de ganancia diaria de peso"><path d="M0 20H600M0 70H600M0 120H600"/>{g.length>1&&<polyline points={g.map((v,i)=>`${getX(i)},${getY(v)}`).join(' ')}/>}{g.map((v,i)=><circle key={i} cx={getX(i)} cy={getY(v)} r="5" fill="var(--tone)"/>)}</svg><div>{g.map((v,i)=><small key={i}>{v.toFixed(3)} kg/día</small>)}</div></div>:<p className="muted">Se requieren dos pesajes con fecha para calcular la GDP.</p>}<div className="measurements"><div><b>Hito</b><b>Fecha</b><b>Peso</b><b>Circunferencia</b></div>{ms.map((m,i)=><div key={i}><span>{label(hit(m))}</span><span>{date(m.measured_at||m.fecha)}</span><span>{Number.isFinite(kg(m))?kg(m)+' kg':'—'}</span><span>{m.scrotal_circumference_cm||m.circunferencia_escrotal_cm?String(m.scrotal_circumference_cm||m.circunferencia_escrotal_cm)+' cm':'—'}</span></div>)}</div></section><footer>BAAPP (OVIAPP) · Trazabilidad ovina <span>Reseña del rancho activo</span></footer></article>
}
