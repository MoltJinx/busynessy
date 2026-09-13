import React, { useEffect, useState } from 'react';
import { SignIn, SignUp, UserButton, useAuth, useClerk, useUser } from '@clerk/react';
import Dashboard from './Dashboard.jsx';
import Console from './Console.jsx';
import { AddressFields, Card, Field, readAddress } from './components.jsx';
import { normalizeMovements, request, setTokenProvider } from './api.js';

const EMPTY = { accounts: [], merchants: [], movements: [], insights: null, customer: null, companyName: '' };

const ACCESS_APPEARANCE = { elements: { rootBox: 'b2b-clerk-root', cardBox: 'b2b-clerk-card-box', card: 'b2b-clerk-card', header: 'b2b-clerk-header', footer: 'b2b-clerk-footer', formFieldLabel: 'b2b-clerk-label', formFieldInput: 'b2b-clerk-input', formButtonPrimary: 'b2b-clerk-button', socialButtonsBlockButton: 'b2b-clerk-social', dividerLine: 'b2b-clerk-divider', dividerText: 'b2b-clerk-divider-text', formFieldAction: 'b2b-clerk-action', footerActionLink: 'b2b-clerk-link' } };

function AccessGate() {
  const [mode, setMode] = useState('signin');
  const signingIn = mode === 'signin';
  return <main id="main-content" className="auth-b2b"><section className="auth-b2b-card" aria-labelledby="access-title"><header><h1 id="access-title">Busynessy B2B</h1><p>{signingIn ? 'Iniciar sesión' : 'Crear una cuenta'}</p></header><div className="access-switch" role="tablist" aria-label="Acceso"><button type="button" role="tab" aria-selected={signingIn} className={signingIn ? 'selected' : ''} onClick={() => setMode('signin')}>Iniciar sesión</button><button type="button" role="tab" aria-selected={!signingIn} className={!signingIn ? 'selected' : ''} onClick={() => setMode('signup')}>Crear una cuenta</button></div>{signingIn ? <SignIn appearance={ACCESS_APPEARANCE}/> : <SignUp appearance={ACCESS_APPEARANCE}/>}</section></main>;
}

function AdminConsole({ onLogout }) {
  const [customerId, setCustomerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [snapshot, setSnapshot] = useState({ customers: [], accounts: [], movements: [], merchants: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

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
      } catch (failure) { if (active) setError(failure.message); }
    }
    load(); return () => { active = false; };
  }, [customerId, accountId, refreshKey]);

  async function mutate(route, body, method = 'POST') {
    setBusy(true);
    try { return await request(`admin/${route}`, { method, body }); }
    finally { setBusy(false); setRefreshKey(value => value + 1); }
  }
  const selectors = <div className="form-grid">
    <Field label="Empresa"><select value={customerId} onChange={event => { setCustomerId(event.target.value); setAccountId(''); }} disabled={busy}>{!snapshot.customers.length && <option value="">Sin empresas</option>}{snapshot.customers.map(row => <option key={row._id} value={row._id}>{[row.first_name, row.last_name].filter(Boolean).join(' ') || 'Empresa'}</option>)}</select></Field>
    <Field label="Cuenta"><select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={busy || !customerId}>{!snapshot.accounts.length && <option value="">Sin cuentas</option>}{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
  </div>;
  return <><div className="connection-bar"><span role={error ? 'alert' : 'status'}>{error || 'Información actualizada'}</span><button className="secondary" onClick={() => setRefreshKey(value => value + 1)} disabled={busy}>Actualizar</button></div><Console adminMode selectors={selectors} companyId={customerId} accountId={accountId} accounts={snapshot.accounts} movements={snapshot.movements} merchants={snapshot.merchants} busy={busy || !!error} ready={!error} mutate={mutate} selectAccount={setAccountId} onLogout={onLogout}/></>;
}

function Onboarding({ getToken, onReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main id="main-content" tabIndex="-1" className="auth"><div className="brand">Busy<span>Nessy</span></div><p className="eyebrow">FINANZAS EMPRESARIALES</p><h1>Registra tu empresa</h1><Card><form onSubmit={async event => {
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
  const { accounts, movements, insights, customer } = snapshot;

  useEffect(() => {
    let active = true;
    async function load() {
      setReady(false);
      try {
        const identity = await request('auth/me');
        const accountRows = identity.accounts || [];
        const nextAccount = accountRows.some(row => row._id === accountId) ? accountId : accountRows[0]?._id || '';
        const [merchantRows, dashboard] = await Promise.all([request('merchants'), nextAccount ? request(`dashboard/${nextAccount}`) : Promise.resolve(null)]);
        if (!active) return;
        setUser(identity.user); setAccountId(nextAccount);
        setSnapshot({ accounts: accountRows.map(row => ({ id: row._id, name: row.nickname, balance: row.balance })), merchants: merchantRows, movements: dashboard ? normalizeMovements(dashboard.movements, nextAccount) : [], insights: dashboard?.insights || null, customer: identity.customer, companyName: identity.user.companyName });
        setError(''); setReady(true);
      } catch (failure) { if (active) setError(failure.message); }
    }
    load(); return () => { active = false; };
  }, [accountId, refreshKey]);

  async function mutate(route, body, method = 'POST') { setBusy(true); try { return await request(route, { method, body }); } finally { setBusy(false); setRefreshKey(value => value + 1); } }
  const controls = <div className="form-grid"><div className="account-owner"><small>Empresa</small><strong>{snapshot.companyName || user.companyName}</strong></div><Field label="Cuenta"><select value={accountId} disabled={!ready || busy} onChange={event => setAccountId(event.target.value)}>{accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>{customer && <div className="account-reference">Titular: {customer.first_name} {customer.last_name}</div>}</div>;
  return <><div className="connection-bar"><span role={error ? 'alert' : 'status'}>{error || (ready ? 'Información actualizada' : 'Cargando información…')}</span><button className="secondary" onClick={() => setRefreshKey(value => value + 1)} disabled={busy}>Actualizar</button><UserButton/></div><Dashboard company={{ name: snapshot.companyName || user.companyName || 'Tu empresa' }} movements={movements} insights={insights} accountId={accountId} busy={busy || !!error} ready={ready} sessionBusy={busy} accountControls={controls} onLogout={onLogout} onSaveGoal={goal => mutate(`insights/${accountId}/goal`, goal, 'PUT')} onReview={(alertId, status) => mutate(`insights/${accountId}/reviews/${alertId}`, { status }, 'PUT')}/></>;
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
