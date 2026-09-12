import React, { useEffect, useRef, useState } from 'react';
import Dashboard from './Dashboard.jsx';
import Console from './Console.jsx';
import { Card, Field, Help, AddressFields, readAddress } from './components.jsx';
import { request, normalizeMovements } from './api.js';

const EMPTY = { accounts: [], merchants: [], movements: [], insights: null, customer:null };
const AUTH_EVENT = 'busynessy-auth-changed';
const accountKey = user => 'busynessy-account-' + user.id;

function AdminConsole({ onLogout }) {
  const [customerId, setCustomerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [snapshot, setSnapshot] = useState({ customers: [], accounts: [], movements: [], merchants: [] });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = () => setRefreshCount(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function sync() {
      setReady(false);
      try {
        const options = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) };
        const customers = await request('admin/customers', options);
        const selectedCustomer = customers.some(row => row._id === customerId) ? customerId : customers[0]?._id || '';
        if (selectedCustomer !== customerId) { if (active) { setCustomerId(selectedCustomer); setAccountId(''); } return; }
        const accounts = selectedCustomer ? await request(`admin/customers/${selectedCustomer}/accounts`, options) : [];
        const selectedAccount = accounts.some(row => row._id === accountId) ? accountId : accounts[0]?._id || '';
        if (selectedAccount !== accountId) { if (active) setAccountId(selectedAccount); return; }
        const [merchants, dashboard] = await Promise.all([
          request('admin/merchants', options),
          selectedAccount ? request(`admin/dashboard/${selectedAccount}`, options) : Promise.resolve(null),
        ]);
        if (!active || controller.signal.aborted) return;
        setSnapshot({ customers, accounts: accounts.map(row => ({ id: row._id, name: row.nickname, balance: row.balance })), merchants, movements: dashboard ? normalizeMovements(dashboard.movements, selectedAccount) : [] });
        setError(''); setReady(true);
      } catch (failure) {
        if (!controller.signal.aborted && active) setError(failure.message);
      }
    }
    sync();
    return () => { active = false; controller.abort(); };
  }, [customerId, accountId, refreshCount]);

  async function mutate(route, body, method = 'POST') {
    setBusy(true); setNoticeError(false); setNotice('Procesando solicitud…');
    try {
      const result = await request(`admin/${route}`, { method, body });
      setNotice('Operación registrada.'); refresh(); return result;
    } catch (failure) {
      setNoticeError(true); setNotice(failure.message); throw failure;
    } finally { setBusy(false); }
  }

  const selectors = <div className="form-grid">
    <Field label="Empresa"><select value={customerId} disabled={busy || !ready} onChange={event => { setCustomerId(event.target.value); setAccountId(''); }}>
      {!snapshot.customers.length && <option value="">Sin empresas</option>}
      {snapshot.customers.map(row => <option key={row._id} value={row._id}>{[row.first_name, row.last_name].filter(Boolean).join(' ') || 'Empresa sin nombre'}</option>)}
    </select></Field>
    <Field label="Cuenta"><select value={accountId} disabled={busy || !ready || !customerId} onChange={event => setAccountId(event.target.value)}>
      {!snapshot.accounts.length && <option value="">Sin cuentas</option>}
      {snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></Field>
  </div>;

  return <>
    <div className="connection-bar">
      {error ? <span role="alert">No se pudo actualizar. {error}</span> : <span>{ready ? 'Información actualizada' : 'Cargando información…'}</span>}
      <button className="secondary" disabled={busy} onClick={refresh}>Actualizar</button>
      {notice && <p className={'notice '+(noticeError ? 'warning' : 'success')} role={noticeError ? 'alert' : 'status'} aria-live={noticeError ? 'assertive' : 'polite'}>{notice}</p>}
    </div>
    <Console adminMode selectors={selectors} companyId={customerId} accountId={accountId} accounts={snapshot.accounts} movements={snapshot.movements} merchants={snapshot.merchants}
      busy={busy || !!error} ready={ready} mutate={mutate} selectAccount={setAccountId} sessionBusy={busy} onApp={() => {}} onLogout={onLogout} />
  </>;
}

export default function App() {
  const [page, setPage] = useState('app');
  const [adminSession, setAdminSession] = useState(false);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const mutationLock = useRef(false);
  const identityVersion = useRef(0);
  const refresh = () => setRefreshCount(value => value + 1);
  const { accounts, merchants, movements, insights, customer } = snapshot;
  const companyId = user?.companyId || '';

  function acceptUser(next) {
    setSnapshot(EMPTY); setReady(false); setSyncedAt(null);
    setUser(next);
    // Esta preferencia no da acceso: el backend valida cada cuenta con la cookie.
    setAccountId(next ? localStorage.getItem(accountKey(next)) || next.primaryAccountId || '' : '');
  }
  function notifyAuthChange() { localStorage.setItem(AUTH_EVENT, crypto.randomUUID()); }
  function navigate(next) {
    const destination = next === 'console' && adminSession ? 'console' : 'app';
    location.hash = destination === 'console' ? 'consola' : 'app';
    setPage(destination);
  }

  useEffect(() => {
    if (booting) return undefined;
    if (adminSession) {
      if (location.hash !== '#consola') history.replaceState(null, '', `${location.pathname}${location.search}#consola`);
      setPage('console');
      return undefined;
    }
    const updateRoute = () => {
      if (location.hash === '#consola') history.replaceState(null, '', `${location.pathname}${location.search}#app`);
      setPage('app');
    };
    updateRoute();
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, [adminSession, booting]);

  useEffect(() => { document.getElementById('main-content')?.focus(); }, [page, user?.id, register, booting]);

  useEffect(() => {
    let active = true;
    async function restore() {
      const version = ++identityVersion.current;
      acceptUser(null); setBooting(true);
      try {
        const session = await request('auth/session');
        if (!active || version !== identityVersion.current) return;
        if (session.authenticated && session.role === 'admin') { setAdminSession(true); return; }
        if (session.authenticated && session.role === 'user') { setAdminSession(false); acceptUser(session.user); }
      } catch (failure) {
        if (active && version === identityVersion.current && failure.status !== 401) setError(failure.message);
      } finally {
        if (active && version === identityVersion.current) setBooting(false);
      }
    }
    // Los IDs guardados por la versión antigua jamás se convierten en sesiones.
    localStorage.removeItem('busynessy-nessie-react');
    restore();
    const onStorage = event => { if (event.key === AUTH_EVENT) restore(); };
    window.addEventListener('storage', onStorage);
    return () => { active = false; window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let timer, failures = 0;
    async function sync() {
      let delay = 3000;
      try {
        const options = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) };
        const current = await request('auth/me', options);
        if (controller.signal.aborted) return;
        // Una cookie puede cambiar en otra pestaña; no mezclar empresas en pantalla.
        if (current.user.id !== user.id) { acceptUser(current.user); return; }
        const accountRows = current.accounts;
        if (!Array.isArray(accountRows)) throw Error('No se pudo obtener la lista de cuentas.');
        const merchantRows = await request('merchants', options);
        const nextAccounts = accountRows.map(a => ({ id: a._id, name: a.nickname, balance: a.balance }));
        const selectedAccount = nextAccounts.some(a => a.id === accountId) ? accountId : nextAccounts[0]?.id || '';
        const dashboard = selectedAccount ? await request('dashboard/' + selectedAccount, options) : null;
        const nextMovements = dashboard ? normalizeMovements(dashboard.movements, selectedAccount) : [];
        if (controller.signal.aborted) return;
        setSnapshot({ accounts: nextAccounts, merchants: merchantRows, movements: nextMovements, insights: dashboard?.insights || null, customer:current.customer, companyName:current.user.companyName });
        setAccountId(selectedAccount);
        localStorage.setItem(accountKey(user), selectedAccount);
        failures = 0; setError(''); setReady(true); setSyncedAt(new Date());
      } catch (failure) {
        failures++;
        delay = Math.max(Math.min(60000,3000*2**Math.min(failures,5)),(failure.retryAfter || 0)*1000);
        if (!controller.signal.aborted) {
          if (failure.status === 401) { acceptUser(null); setError('Tu sesión terminó. Inicia sesión de nuevo.'); }
          else setError(failure.message);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(sync, delay);
      }
    }
    sync();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [user, accountId, refreshCount]);

  function selectAccount(id) {
    setAccountId(id); setReady(false); setSyncedAt(null);
    setSnapshot(previous => ({ ...previous, movements: [], insights: null }));
  }
  async function mutate(route, body, method = 'POST') {
    if (mutationLock.current) throw Error('Espera a que termine la operación anterior.');
    mutationLock.current = true; setBusy(true); setNoticeError(false); setNotice('Procesando solicitud…');
    try {
      const result = await request(route, { method, body });
      setNotice(result.warning || (route.startsWith('insights/') ? 'Cambios guardados.' : 'Operación registrada.'));
      refresh(); return result;
    } catch (failure) {
      if (failure.status === 401) acceptUser(null);
      setNoticeError(true); setNotice(failure.message + ' Revisa el historial antes de reintentar.');
      throw failure;
    } finally { mutationLock.current = false; setBusy(false); }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await request('auth/logout', { method: 'POST' });
      identityVersion.current++;
      acceptUser(null); setRegister(false); setNotice(''); setError(''); navigate('app'); notifyAuthChange();
    } catch (failure) { setError('No se pudo cerrar la sesión: ' + failure.message); }
    finally { setBusy(false); }
  }
  async function logoutAdmin() {
    if (busy) return;
    setBusy(true);
    try {
      await request('auth/logout', { method: 'POST' });
      identityVersion.current++;
      setAdminSession(false); acceptUser(null); setNotice(''); setError(''); navigate('app'); notifyAuthChange();
    } catch (failure) { setError('No se pudo cerrar la sesión: ' + failure.message); }
    finally { setBusy(false); }
  }

  if (booting) return <main id="main-content" className="auth"><h1>BusyNessy</h1><p role="status">Comprobando sesión…</p></main>;
  if (adminSession) return <AdminConsole onLogout={logoutAdmin} />;
  if (!user) return <main id="main-content" tabIndex="-1" className="auth"><div className="brand">Busy<span>Nessy</span></div>
    <p className="eyebrow">FINANZAS EMPRESARIALES</p><h1>{register ? 'Registra tu empresa' : 'Bienvenido de nuevo'}</h1>
    <Card><div className="segmented" aria-label="Acceso">
      <button disabled={busy} aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Iniciar sesión</button>
      <button disabled={busy} aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Registrarse</button>
    </div>
    <form key={register ? 'register' : 'login'} onSubmit={async event => {
      event.preventDefault();
      if (mutationLock.current) return;
      const form = new FormData(event.currentTarget);
      const submittedUsername = String(form.get('username') || '');
      const username = submittedUsername.trim();
      const password = form.get('password');
      if (register && password !== form.get('confirm')) { setError('Las contraseñas no coinciden.'); return; }
      if (register && username.toLowerCase() === 'admin') { setError('Ese usuario no está disponible.'); return; }
      mutationLock.current = true; setBusy(true); setError('');
      const version = ++identityVersion.current;
      try {
        if (!register && submittedUsername === 'admin' && password === 'password') {
          const result = await request('auth/admin/login', { method: 'POST', body: { username: submittedUsername, password } });
          if (version !== identityVersion.current || result.role !== 'admin') return;
          acceptUser(null); setAdminSession(true); setNoticeError(false); setNotice(''); notifyAuthChange(); return;
        }
        const result = await request(register ? 'auth/register' : 'auth/login', {
          method: 'POST', body: { username, password, ...(register ? { name: form.get('name'), firstName: form.get('firstName'), lastName: form.get('lastName'), address: readAddress(form), accountType:form.get('accountType') } : {}) },
        });
        if (version !== identityVersion.current) return;
        acceptUser(result.user);
        if (result.account) setAccountId(result.account._id);
        setNoticeError(false); setNotice(result.warning || (register ? 'Empresa registrada. Tu cuenta está disponible.' : ''));
        navigate(register ? 'app' : page); notifyAuthChange();
      } catch (failure) { setError(failure.message); }
      finally { mutationLock.current = false; setBusy(false); }
    }}>
      {register && <><Field label="Nombre de tu empresa"><input name="name" autoComplete="organization" required maxLength="100" disabled={busy}/></Field><div className="form-grid">
        <Field label="Nombre del responsable" help="Opcional. Si lo dejas vacío, se generará un nombre para el registro."><input name="firstName" autoComplete="given-name" maxLength="100" disabled={busy}/></Field><Field label="Apellidos del responsable" help="Si no se proporcionan, se generarán apellidos para el registro."><input name="lastName" autoComplete="family-name" maxLength="100" disabled={busy}/></Field></div>
        <Field label="Tipo de cuenta"><select name="accountType" disabled={busy}><option value="Checking">Operativa (Checking)</option><option value="Savings">Ahorro (Savings)</option></select></Field>
        </>}
      <Field label="Usuario" help="De 3 a 40 letras sin acentos, números, puntos o guiones."><input name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" required minLength="3" maxLength="40" disabled={busy}/></Field>
      <Field label="Contraseña" help="Para registrarte, utiliza entre 12 y 128 caracteres. No compartas tu contraseña."><input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength="128" disabled={busy}/></Field>
      {register && <><Field label="Confirmar contraseña"><input name="confirm" type="password" autoComplete="new-password" required minLength="12" maxLength="128" disabled={busy}/></Field><h2>Dirección de registro<Help label="Dirección opcional">Los campos vacíos se completan con una dirección de Ciudad de México.</Help></h2><AddressFields disabled={busy} optional/></>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Procesando…' : register ? 'Registrar mi empresa' : page === 'console' ? 'Entrar a la consola →' : 'Entrar al panel →'}</button>
    </form>
    </Card>
  </main>;

  const connection = <div className="connection-bar">
    {error ? <span role="alert">No se pudo actualizar. {error}</span> : <span>{syncedAt ? 'Última actualización · ' + syncedAt.toLocaleTimeString() : 'Conectando…'}</span>}
    <button className="secondary" disabled={busy} onClick={refresh}>Actualizar</button>
    {notice && <p className={'notice '+(noticeError ? 'warning' : 'success')} role={noticeError ? 'alert' : 'status'} aria-live={noticeError ? 'assertive' : 'polite'}>{notice}</p>}
  </div>;
  const selectors = <div className="form-grid">
    <div className="account-owner"><small>Empresa</small><strong>{snapshot.companyName || user.companyName}</strong></div>
    <Field label="Cuenta"><select value={accountId} disabled={busy || !ready} onChange={e => selectAccount(e.target.value)}>
      {!accounts.length && <option value="">Sin cuentas</option>}
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select></Field>
    <div className="account-reference">Referencia de cuenta<Help label="Referencia de cuenta">{accountId || 'Aún no tienes cuentas. Puedes crear una desde la consola.'}</Help></div>
    {customer && <div className="account-reference">Titular: {customer.first_name} {customer.last_name}<Help label="Perfil de la cuenta">ID: {customer._id}. {customer.address?.street_number} {customer.address?.street_name}, {customer.address?.city}, {customer.address?.state} {customer.address?.zip}.</Help></div>}
  </div>;
  return <>{connection}<Dashboard key={user.id} company={{ name: snapshot.companyName || user.companyName }} movements={movements}
    insights={insights} accountId={accountId} busy={busy || !ready || !!error} sessionBusy={busy} ready={ready}
    onSaveGoal={goal => mutate(`insights/${accountId}/goal`, goal, 'PUT')}
    onReview={(alertId,status) => mutate(`insights/${accountId}/reviews/${alertId}`, { status }, 'PUT')}
    accountControls={selectors} onLogout={logout} /></>;
}
