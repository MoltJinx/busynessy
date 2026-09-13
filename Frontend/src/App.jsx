import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import Dashboard from './Dashboard.jsx';
import Console from './Console.jsx';
import { AddressFields, Card, Field, readAddress } from './components.jsx';
import { normalizeMovements, request, setTokenProvider } from './api.js';
import { SiteHeader, SiteFooter, RefreshToast, assetUrl } from './SiteChrome.jsx';

const EMPTY = { accounts: [], merchants: [], movements: [], insights: null, customer: null, companyName: '' };

const ACCESS_APPEARANCE = { elements: { rootBox: 'b2b-clerk-root', cardBox: 'b2b-clerk-card-box', card: 'b2b-clerk-card', header: 'b2b-clerk-header', footer: 'b2b-clerk-footer', formFieldLabel: 'b2b-clerk-label', formFieldInput: 'b2b-clerk-input', formButtonPrimary: 'b2b-clerk-button', socialButtonsBlockButton: 'b2b-clerk-social', dividerLine: 'b2b-clerk-divider', dividerText: 'b2b-clerk-divider-text', formFieldAction: 'b2b-clerk-action', footerActionLink: 'b2b-clerk-link' } };

function PullToRefresh({ onRefresh, refreshing }) {
  const [distance, setDistance] = useState(0);
  const refreshRef = useRef(onRefresh);
  const refreshingRef = useRef(refreshing);

  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const header = document.querySelector('.bank-header');
    const syncHeaderHeight = () => { if (header) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`); };
    syncHeaderHeight();
    const headerObserver = header && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncHeaderHeight) : null;
    headerObserver?.observe(header);
    window.addEventListener('resize', syncHeaderHeight);
    // Un mouse/trackpad "fino" dispara wheel al mínimo scroll hacia arriba; solo
    // habilitamos el gesto de rueda en dispositivos de puntero "grueso" (pantallas
    // táctiles), para que en PC el refresco solo se active con Alt+R y no se quede
    // tapando el encabezado al navegar entre secciones.
    const wheelGestureEnabled = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    let startY = null;
    let pullDistance = 0;
    let wheelDistance = 0;
    let wheelTimer;
    let cooldown = 0;
    const atTop = () => window.scrollY <= 1 && document.documentElement.scrollTop <= 1;
    const blocked = target => refreshingRef.current || Date.now() < cooldown || document.querySelector('dialog[open]') || target?.closest?.('input,select,textarea,button,a,[role="dialog"],[role="menu"],.help-popover');
    const reset = () => { pullDistance = 0; wheelDistance = 0; setDistance(0); };
    const trigger = () => {
      if (!refreshingRef.current && refreshRef.current?.()) {
        refreshingRef.current = true;
        cooldown = Date.now() + 1500;
      }
      reset();
    };
    const onTouchStart = event => { startY = atTop() && !blocked(event.target) && event.touches.length === 1 ? event.touches[0]?.clientY ?? null : null; };
    const onTouchMove = event => {
      if (startY == null || !atTop() || refreshingRef.current || event.touches.length !== 1) return;
      const delta = (event.touches[0]?.clientY ?? startY) - startY;
      if (delta <= 0) return reset();
      pullDistance = Math.min(96, Math.round(delta * 0.42));
      setDistance(pullDistance);
      if (pullDistance > 10) event.preventDefault();
    };
    const onTouchEnd = () => { if (pullDistance >= 64) trigger(); else reset(); startY = null; };
    const onWheel = event => {
      if (!atTop() || event.deltaY >= 0 || blocked(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return reset();
      const delta = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      wheelDistance = Math.min(96, wheelDistance + delta * 0.25);
      setDistance(wheelDistance);
      event.preventDefault();
      clearTimeout(wheelTimer);
      if (wheelDistance >= 64) return trigger();
      wheelTimer = setTimeout(reset, 450);
    };
    const onCancel = () => { startY = null; reset(); };
    const onKey = event => { if (event.altKey && event.key.toLowerCase() === 'r' && !blocked(event.target)) { event.preventDefault(); trigger(); } };
    document.documentElement.classList.add('gesture-refresh-enabled');
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    if (wheelGestureEnabled) window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(wheelTimer);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (wheelGestureEnabled) window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchcancel', onCancel);
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('gesture-refresh-enabled');
      headerObserver?.disconnect();
      window.removeEventListener('resize', syncHeaderHeight);
    };
  }, []);

  const label = refreshing ? 'Actualizando información…' : distance >= 64 ? 'Suelta para actualizar' : 'Desliza para actualizar';
  return <div className={'pull-refresh' + (refreshing ? ' is-refreshing' : '')} style={{ '--pull-distance': `${refreshing ? 88 : distance}px` }} role="status" aria-live="polite" aria-hidden={!refreshing && !distance}>
    <span className="pull-refresh-spinner" aria-hidden="true"/>{refreshing || distance ? label : ''}
  </div>;
}

function useRefreshNotice() {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice || notice === 'Actualizando información…') return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  return [notice, setNotice];
}

function AccessGate() {
  const [mode, setMode] = useState('signin');
  const signingIn = mode === 'signin';
  return <main id="main-content" className="auth-b2b"><section className="auth-b2b-card" aria-labelledby="access-title"><header><img className="access-logo" src={assetUrl('brand-header.png')} alt="BusyNessy"/><h1 id="access-title">{signingIn ? 'Iniciar sesión' : 'Crear una cuenta'}</h1></header><div className="access-switch" role="group" aria-label="Acceso"><button type="button" aria-pressed={signingIn} className={signingIn ? 'selected' : ''} onClick={() => setMode('signin')}>Iniciar sesión</button><button type="button" aria-pressed={!signingIn} className={!signingIn ? 'selected' : ''} onClick={() => setMode('signup')}>Crear una cuenta</button></div>{signingIn ? <SignIn appearance={ACCESS_APPEARANCE}/> : <SignUp appearance={ACCESS_APPEARANCE}/>}</section></main>;
}

function AdminConsole({ onLogout }) {
  const { user } = useUser();
  const [customerId, setCustomerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [snapshot, setSnapshot] = useState({ customers: [], accounts: [], movements: [], merchants: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useRefreshNotice();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const customers = await request('admin/customers');
        const nextCustomer = customers.some(row => row._id === customerId) ? customerId : customers[0]?._id || '';
        if (nextCustomer !== customerId) { if (active) { setCustomerId(nextCustomer); setAccountId(''); } return; }
        const accounts = nextCustomer ? await request(`admin/customers/${nextCustomer}/accounts`) : [];
        const nextAccount = accounts.some(row => row._id === accountId) ? accountId : accounts[0]?._id || '';
        if (nextAccount !== accountId) { if (active) setAccountId(nextAccount); return; }
        const [merchants, dashboard] = await Promise.all([
          request('admin/merchants'), nextAccount ? request(`admin/dashboard/${nextAccount}`) : Promise.resolve(null),
        ]);
        if (!active) return;
        setSnapshot({ customers, accounts: accounts.map(row => ({ id: row._id, name: row.nickname, balance: row.balance })), merchants, movements: dashboard ? normalizeMovements(dashboard.movements, nextAccount) : [] });
        setError('');
        if (refreshing) setRefreshNotice('Información actualizada');
      } catch (failure) {
        if (active) {
          setError(failure.message);
          if (refreshing) setRefreshNotice('No fue posible actualizar la información.');
        }
      } finally { if (active) setRefreshing(false); }
    }
    load(); return () => { active = false; };
  }, [customerId, accountId, refreshKey]);

  async function mutate(route, body, method = 'POST') {
    setBusy(true);
    try { return await request(`admin/${route}`, { method, body }); }
    finally { setBusy(false); setRefreshKey(value => value + 1); }
  }
  const refresh = useCallback(() => {
    if (busy || refreshing) return;
    setRefreshing(true); setRefreshNotice('Actualizando información…'); setRefreshKey(value => value + 1);
    return true;
  }, [busy, refreshing, setRefreshNotice]);
  const selectors = <div className="form-grid">
    <Field label="Empresa"><select value={customerId} onChange={event => { setCustomerId(event.target.value); setAccountId(''); }} disabled={busy}>{!snapshot.customers.length && <option value="">Sin empresas</option>}{snapshot.customers.map(row => <option key={row._id} value={row._id}>{[row.first_name, row.last_name].filter(Boolean).join(' ') || 'Empresa'}</option>)}</select></Field>
    <Field label="Cuenta"><select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={busy || !customerId}>{!snapshot.accounts.length && <option value="">Sin cuentas</option>}{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
  </div>;
  const email = user?.primaryEmailAddress?.emailAddress || 'Administrador';
  return <><PullToRefresh onRefresh={refresh} refreshing={refreshing}/><RefreshToast error={error} message={refreshNotice}/><SiteHeader email={email} onHome={() => window.scrollTo({ top: 0 })}/><Console adminMode selectors={selectors} companyId={customerId} accountId={accountId} accounts={snapshot.accounts} movements={snapshot.movements} merchants={snapshot.merchants} busy={busy || refreshing || !!error} ready={!error} mutate={mutate} selectAccount={setAccountId} onLogout={onLogout}/><SiteFooter/></>;
}

function Onboarding({ getToken, onReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main id="main-content" tabIndex="-1" className="auth"><img className="brand-logo" src="/Busynesy-logo.png" alt="Busynessy"/><p className="eyebrow">FINANZAS EMPRESARIALES</p><h1>Registra tu empresa</h1><Card><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    try { const token = await getToken(); const result = await request('auth/clerk/provision', { method: 'POST', token, body: { name: form.get('name'), firstName: form.get('firstName'), lastName: form.get('lastName'), accountType: form.get('accountType'), address: readAddress(form) } }); onReady(result.user); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }}><Field label="Nombre de tu empresa"><input name="name" autoComplete="organization" required maxLength="100" disabled={busy}/></Field><div className="form-grid"><Field label="Nombre del responsable"><input name="firstName" autoComplete="given-name" maxLength="100" disabled={busy}/></Field><Field label="Apellidos del responsable"><input name="lastName" autoComplete="family-name" maxLength="100" disabled={busy}/></Field></div><Field label="Tipo de cuenta"><select name="accountType" disabled={busy}><option value="Checking">Operativa</option><option value="Savings">Ahorro</option></select></Field><h2>Dirección de registro</h2><AddressFields disabled={busy} optional/>{error && <p role="alert" className="notice warning">{error}</p>}<button disabled={busy}>{busy ? 'Registrando…' : 'Crear empresa y cuenta'}</button></form></Card></main>;
}

function SignedApplication({ initialUser, onLogout }) {
  const [user, setUser] = useState(initialUser);
  const [accountId, setAccountId] = useState(initialUser.primaryAccountId || '');
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useRefreshNotice();
  const { accounts, movements, insights, customer } = snapshot;

  useEffect(() => {
    let active = true;
    async function load() {
      if (!refreshing) setReady(false);
      try {
        const identity = await request('auth/me');
        const accountRows = identity.accounts || [];
        const nextAccount = accountRows.some(row => row._id === accountId) ? accountId : accountRows[0]?._id || '';
        const [merchantRows, dashboard] = await Promise.all([request('merchants'), nextAccount ? request(`dashboard/${nextAccount}`) : Promise.resolve(null)]);
        if (!active) return;
        setUser(identity.user); setAccountId(nextAccount);
        setSnapshot({ accounts: accountRows.map(row => ({ id: row._id, name: row.nickname, balance: row.balance })), merchants: merchantRows, movements: dashboard ? normalizeMovements(dashboard.movements, nextAccount) : [], insights: dashboard?.insights || null, customer: identity.customer, companyName: identity.user.companyName });
        setError(''); setReady(true);
        if (refreshing) setRefreshNotice('Información actualizada');
      } catch (failure) {
        if (active) {
          setError(failure.message);
          if (refreshing) setRefreshNotice('No fue posible actualizar la información.');
        }
      } finally { if (active) setRefreshing(false); }
    }
    load(); return () => { active = false; };
  }, [accountId, refreshKey]);

  async function mutate(route, body, method = 'POST') { setBusy(true); try { return await request(route, { method, body }); } finally { setBusy(false); setRefreshKey(value => value + 1); } }
  const refresh = useCallback(() => {
    if (busy || refreshing) return;
    setRefreshing(true); setRefreshNotice('Actualizando información…'); setRefreshKey(value => value + 1);
    return true;
  }, [busy, refreshing, setRefreshNotice]);
  const controls = <div className="form-grid"><div className="account-owner"><small>Empresa</small><strong>{snapshot.companyName || user.companyName}</strong></div><Field label="Cuenta"><select value={accountId} disabled={!ready || busy} onChange={event => setAccountId(event.target.value)}>{accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>{customer && <div className="account-reference">Titular: {customer.first_name} {customer.last_name}</div>}</div>;
  return <><PullToRefresh onRefresh={refresh} refreshing={refreshing}/><RefreshToast error={error} message={refreshNotice}/><Dashboard company={{ name: snapshot.companyName || user.companyName || 'Tu empresa' }} movements={movements} insights={insights} accountId={accountId} busy={busy || refreshing || !!error} ready={ready} sessionBusy={busy} accountControls={controls} onLogout={onLogout} onSaveGoal={goal => mutate(`insights/${accountId}/goal`, goal, 'PUT')} onReview={(alertId, status) => mutate(`insights/${accountId}/reviews/${alertId}`, { status }, 'PUT')}/></>;
}

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const [state, setState] = useState({ status: 'loading', user: null });
  useEffect(() => {
    setTokenProvider(() => getToken());
    return () => setTokenProvider(null);
  }, [getToken]);
  useEffect(() => {
    let active = true;
    async function exchange() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        try { await request('auth/logout', { method: 'POST' }); } catch {}
        if (active) setState({ status: 'signed-out', user: null });
        return;
      }
      try { const token = await getToken(); const session = await request('auth/clerk/session', { method: 'POST', token }); if (!active) return; setState(session.role === 'admin' ? { status: 'admin', user: null } : session.linked ? { status: 'app', user: session.user } : { status: 'onboarding', user: null }); }
      catch (failure) { if (active) setState({ status: 'error', error: failure.message, user: null }); }
    }
    exchange(); return () => { active = false; };
  }, [isLoaded, isSignedIn, getToken, clerkUser?.id]);
  async function logout() { try { await request('auth/logout', { method: 'POST' }); } catch {} await clerk.signOut(); setState({ status: 'signed-out', user: null }); }
  if (!isLoaded || state.status === 'loading') return <main id="main-content" className="auth"><p role="status">Comprobando sesión…</p></main>;
  if (state.status === 'error') return <main id="main-content" className="auth"><Card><h1>No se pudo iniciar la sesión</h1><p role="alert">{state.error}</p><button onClick={() => location.reload()}>Intentar de nuevo</button></Card></main>;
  if (state.status === 'signed-out') return <AccessGate/>;
  if (state.status === 'admin') return <AdminConsole onLogout={logout}/>;
  if (state.status === 'onboarding') return <Onboarding getToken={getToken} onReady={user => setState({ status: 'app', user })}/>;
  return <SignedApplication initialUser={state.user} onLogout={logout}/>;
}
