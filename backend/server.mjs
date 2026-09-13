import http from "node:http";
import fs from "node:fs";
import { randomUUID } from 'node:crypto';
import { createClerkClient } from '@clerk/backend';
import { createNessieClient, nessieTrace } from './nessie.mjs';
import { customerPayload, provisionAccount } from './provisioning.mjs';
import { createAuthStore, publicUser, fault } from './auth.mjs';
import { analyzeAccount, createInsightStore } from './insights.mjs';
import { createDataStore, createSupabase, toRemoteAccount } from './supabase.mjs';

const env = {};
for (const file of ["../.env", ".env", ".env.clerk", "../Frontend/.env.local"]) {
  const url = new URL(file, import.meta.url);
  if (fs.existsSync(url)) for (const line of fs.readFileSync(url, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/); if (match) env[match[1]] = match[2].trim();
  }
}
const nessie = createNessieClient({
  key: process.env.NESSIE_API_KEY || env.NESSIE_API_KEY,
  baseUrl: process.env.NESSIE_API_BASE_URL || env.NESSIE_API_BASE_URL || 'https://prod-api.nessieisreal.com',
  // Las trazas se envían a stdout; no se persiste estado de negocio en disco.
  auditFile: null,
});
const clerkSecretKey = process.env.CLERK_SECRET_KEY || env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkClient = clerkSecretKey && clerkPublishableKey ? createClerkClient({ secretKey: clerkSecretKey, publishableKey: clerkPublishableKey }) : null;
const supabase = createSupabase(process.env.SUPABASE_URL || env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
const auth = createAuthStore(createDataStore(supabase));
const insightStore = createInsightStore(supabase);
const clerkAuthorizedParties = ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5174", "http://localhost:5174"];

async function clerkIdentity(req) {
  if (!clerkClient) throw fault(503, 'El acceso no está configurado.');
  let userId;
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
    const url = `http://${req.headers.host || '127.0.0.1:8787'}${req.url || '/'}`;
    const requestState = await clerkClient.authenticateRequest(new Request(url, { method: req.method, headers }), { authorizedParties: clerkAuthorizedParties, acceptsToken: 'session_token' });
    userId = requestState.toAuth().userId;
  } catch (error) {
    console.warn('[auth] Clerk rechazó la sesión:', error?.code || error?.name || 'error');
    throw fault(401, 'Tu sesión no pudo verificarse. Inicia sesión de nuevo.');
  }
  if (!userId) throw fault(401, 'Tu sesión no pudo verificarse. Inicia sesión de nuevo.');
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress || '';
    return {
      id: user.id,
      username: user.username || email || user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      isAdmin: user.publicMetadata?.role === 'admin',
    };
  } catch {
    throw fault(401, 'No se pudo recuperar tu perfil. Inicia sesión de nuevo.');
  }
}

async function currentUser(req) {
  const identity = await clerkIdentity(req);
  if (identity.isAdmin) throw fault(403, 'Esta sesión solo tiene acceso a la consola administrativa.');
  const user = await auth.findByClerkId(identity.id);
  if (!user?.customerId) throw fault(401, 'Registra tu empresa para continuar.');
  return user;
}

async function currentAdmin(req) {
  const identity = await clerkIdentity(req);
  if (!identity.isAdmin) throw fault(403, 'No tienes acceso a la consola administrativa.');
  return identity;
}

const requiredText = (value, label, max = 100) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw fault(400, `${label}: campo obligatorio (máximo ${max} caracteres).`);
  return value.trim();
};
function addressInput(input) {
  const address = {};
  for (const [field,label] of Object.entries({street_number:'Número',street_name:'Calle',city:'Ciudad',state:'Estado',zip:'Código postal'})) address[field] = requiredText(input?.[field],label);
  address.state = address.state.toUpperCase();
  if (!/^[A-ZÁÉÍÓÚÜÑ ]{2,30}$/.test(address.state) || !/^\d{5}$/.test(address.zip)) throw fault(400,'Usa una entidad federativa de 2 a 30 letras y un código postal de cinco dígitos.');
  return address;
}

async function readMovements(accountId) {
  const resources = ['deposits','withdrawals','purchases','bills'];
  return Object.fromEntries(await Promise.all(resources.map(async resource => [resource, await nessie(`/accounts/${accountId}/${resource}`)])));
}

const remoteMovementRows = raw => Object.entries({ deposits: 'deposit', withdrawals: 'withdrawal', purchases: 'purchase', bills: 'bill' }).flatMap(([resource, type]) => (raw[resource] || []).map(row => ({
  nessie_id: row._id,
  type,
  amount: Number(row.amount ?? row.payment_amount),
  description: String(row.description || row.nickname || row.payee || 'Sin descripción'),
  status: row.status || 'completed',
  occurred_on: row.transaction_date || row.purchase_date || row.payment_date,
  raw: row,
}))).filter(row => row.nessie_id && Number.isFinite(row.amount) && row.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on));

const storedMovements = rows => Object.entries({ deposit: 'deposits', withdrawal: 'withdrawals', purchase: 'purchases', bill: 'bills' }).reduce((all, [type, resource]) => {
  all[resource] = rows.filter(row => row.type === type).map(row => row.raw && typeof row.raw === 'object' ? row.raw : ({ _id: row.nessie_id, amount: Number(row.amount), description: row.description, status: row.status, [type === 'purchase' ? 'purchase_date' : type === 'bill' ? 'payment_date' : 'transaction_date']: row.occurred_on }));
  return all;
}, {});

async function syncAccount(account) {
  const run = await auth.startSync(account.id);
  try {
    const [remote, movements] = await Promise.all([nessie('/accounts/' + account.nessieId), readMovements(account.nessieId)]);
    if (remote._id !== account.nessieId) throw fault(502, 'La cuenta recibida no coincide con la solicitada.');
    const counts = await auth.upsertMovements(account.id, remoteMovementRows(movements));
    const updated = await auth.updateAccount(account.id, remote);
    await auth.finishSync(run.id, 'completed', counts);
    return { account: updated, movements: storedMovements(await auth.movementsForAccount(account.id)) };
  } catch (error) {
    try { await auth.finishSync(run.id, 'failed', {}, String(error.message || 'Error de sincronización').slice(0, 500)); } catch {}
    throw error;
  }
}

// Nessie no tiene entidad "empresa": el nombre visual procede del alias de su
// cuenta principal, y el responsable/dirección del recurso customer remoto.
function companyNameFromApi(user, accounts, customer) {
  const primary = accounts.find(account=>account._id===user.accountIds?.[0]) || accounts[0];
  return primary?.nickname?.replace(/ · Operación$/,'') || [customer?.first_name,customer?.last_name].filter(Boolean).join(' ');
}
async function readIdentity(user) {
  const accounts = await auth.accountsForUser(user);
  const customer = user.customerRaw && typeof user.customerRaw === 'object' ? user.customerRaw : { _id: user.customerId, first_name: user.customerName };
  const remoteAccounts = accounts.map(toRemoteAccount);
  return { user:{...publicUser({ ...user, accountIds: accounts.map(row => row.nessieId) }),companyName:user.customerName || companyNameFromApi(user,remoteAccounts,customer)}, customer, accounts:remoteAccounts };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": res.origin || "http://127.0.0.1:4173", "access-control-allow-credentials": "true", "vary":"Origin", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "Content-Type, X-Busynessy-Request, Authorization", "cache-control":"no-store", "x-content-type-options":"nosniff" });
  res.end(JSON.stringify(body));
}

const CORS_ORIGINS = ["http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5174", "http://localhost:5174"];
function allowedOrigin(origin) {
  if (origin === "http://127.0.0.1:4173") return "http://127.0.0.1:4173";
  if (origin === "http://localhost:4173") return "http://localhost:4173";
  if (origin === "http://127.0.0.1:5173") return "http://127.0.0.1:5173";
  if (origin === "http://localhost:5173") return "http://localhost:5173";
  if (origin === "http://127.0.0.1:5174") return "http://127.0.0.1:5174";
  if (origin === "http://localhost:5174") return "http://localhost:5174";
  return "http://127.0.0.1:4173";
}

// El alta inicial crea un historial completo y necesita un presupuesto mayor
// que una operación individual, sin reintentar POSTs si falla la red.
http.createServer((req, res) => nessieTrace.run({ requestId: randomUUID(), deadline:Date.now()+240000 }, async () => {
  res.setHeader('X-Request-Id',nessieTrace.getStore().requestId);
  res.setHeader('Access-Control-Expose-Headers','X-Request-Id, Retry-After');
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && !CORS_ORIGINS.includes(origin)) return send(res,403,{error:"Origen no permitido"});
  res.origin = allowedOrigin(origin);
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-busynessy-request'] !== '1') throw fault(403, 'Solicitud no permitida.');
    const id = value => { if (!/^[a-zA-Z0-9-]{1,80}$/.test(value || "")) throw fault(400,"Identificador inválido"); return value; };
    const body = async () => {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 32768) throw fault(413,'Solicitud demasiado grande.'); }
      let parsed;
      try { parsed = JSON.parse(raw || '{}'); } catch { throw fault(400,'El cuerpo debe ser JSON válido.'); }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw fault(400,'Se requiere un objeto JSON.');
      return parsed;
    };
    if (req.method === 'POST' && req.url === '/api/auth/logout') {
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/auth/clerk/session') {
      const identity = await clerkIdentity(req);
      if (identity.isAdmin) {
        return send(res, 200, { role: 'admin', linked: true });
      }
      const user = await auth.findByClerkId(identity.id);
      if (!user) return send(res, 200, { role: 'user', linked: false, profile: { firstName: identity.firstName, lastName: identity.lastName } });
      return send(res, 200, { role: 'user', linked: Boolean(user.customerId), user: publicUser(user) });
    }
    if (req.method === 'POST' && req.url === '/api/auth/clerk/provision') {
      const identity = await clerkIdentity(req);
      if (identity.isAdmin) throw fault(403, 'La cuenta administrativa no puede registrar una empresa.');
      if ((await auth.findByClerkId(identity.id))?.customerId) throw fault(409, 'Esta cuenta ya tiene una empresa vinculada.');
      const b = await body();
      if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 100) throw fault(400, 'Escribe el nombre de tu empresa (máximo 100 caracteres).');
      if (b.accountType && !['Checking','Savings'].includes(b.accountType)) throw fault(400, 'Tipo de cuenta inválido.');
      const profile = customerPayload({ ...b, firstName: b.firstName || identity.firstName, lastName: b.lastName || identity.lastName });
      const { user, result } = await auth.registerClerk({ clerkId: identity.id, username: identity.username }, async (link, linkAccount) => {
        const customer = await nessie('/customers', { method:'POST', body:JSON.stringify(profile) });
        const customerId = customer.objectCreated?._id;
        if (!customerId) throw fault(502,'No se confirmó el ID del cliente. Revisa los registros antes de reintentar.');
        try {
          const stored = await nessie('/customers/'+customerId);
          if (stored._id !== customerId) throw fault(502,'No se pudo verificar el perfil del cliente.');
          await link(stored, b.name.trim());
          const provisioned = await provisionAccount(nessie, customerId, { nickname:b.name.trim()+' · Operación', type:b.accountType || 'Checking' }, linkAccount);
          return { account:provisioned.objectCreated, customer:stored, verification:provisioned.verification, ...(provisioned.warning ? {warning:provisioned.warning} : {}) };
        } catch (error) {
          return { customer:customer.objectCreated, warning:'Tu empresa existe, pero no se confirmó el alta de la cuenta: '+error.message+' Revisa la consola antes de crear otra.' };
        }
      });
      const createdAccount = result.account?._id ? await auth.accountForUser(user, result.account._id) : null;
      if (createdAccount) await syncAccount(createdAccount);
      return send(res, 201, { user:{...publicUser(user), companyName:companyNameFromApi(user,result.account?[result.account]:[],result.customer)}, ...result });
    }
    if (req.method === 'GET' && req.url === '/api/auth/session') {
      try {
        const user = await currentUser(req);
        return send(res, 200, { authenticated: true, role: 'user', ...(await readIdentity(user)) });
      } catch (error) {
        if (error.status !== 401) throw error;
      }
      try {
        await currentAdmin(req);
        return send(res, 200, { authenticated: true, role: 'admin' });
      } catch (error) {
        if (error.status !== 401) throw error;
        return send(res, 200, { authenticated: false });
      }
    }
    if (req.method === 'POST' && req.url === '/api/auth/admin/login') {
      throw fault(410, 'Inicia sesión desde la pantalla de acceso.');
    }
    if (req.method === 'GET' && req.url === '/api/auth/admin/me') {
      await currentAdmin(req); return send(res, 200, { role: 'admin' });
    }
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      throw fault(410, 'Inicia sesión desde la pantalla de acceso.');
    }
    if (req.method === 'POST' && req.url === '/api/auth/register') {
      throw fault(410, 'Registra tu empresa desde la pantalla de acceso.');
    }
    const adminCustomers = async () => {
      await currentAdmin(req);
      return auth.linkedCustomers();
    };
    const adminCustomer = async customerId => {
      const customer = (await adminCustomers()).find(row => row._id === customerId);
      if (!customer) throw fault(403, 'No tienes acceso a esa empresa.');
      return customer;
    };
    const adminAccount = async accountId => {
      const account = await nessie('/accounts/' + accountId);
      await adminCustomer(account.customer_id);
      return account;
    };
    if (req.method === 'GET' && req.url === '/api/admin/customers') return send(res, 200, await adminCustomers());
    const adminAccounts = req.url.match(/^\/api\/admin\/customers\/([a-zA-Z0-9-]+)\/accounts$/);
    if (req.method === 'GET' && adminAccounts) {
      await adminCustomer(adminAccounts[1]);
      return send(res, 200, await nessie('/customers/' + adminAccounts[1] + '/accounts'));
    }
    const adminDashboard = req.url.match(/^\/api\/admin\/dashboard\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'GET' && adminDashboard) {
      const account = await adminAccount(adminDashboard[1]);
      const [movements, merchants] = await Promise.all([readMovements(account._id), nessie('/merchants')]);
      const insights = analyzeAccount(movements, merchants, account.balance, {});
      return send(res,200,{ account, movements, insights });
    }
    if (req.method === 'GET' && req.url === '/api/admin/merchants') {
      await currentAdmin(req); return send(res, 200, await nessie('/merchants'));
    }
    if (req.method === 'POST' && req.url === '/api/admin/merchants') {
      await currentAdmin(req);
      const b=await body(), name=requiredText(b.name,'Nombre del comercio'), category=requiredText(b.category,'Categoría'), address=addressInput(b.address);
      const lat=Number(b.lat), lng=Number(b.lng);
      if(b.lat == null || b.lng == null || b.lat === '' || b.lng === '' || !Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw fault(400,'Coordenadas inválidas.');
      return send(res,201,await nessie('/merchants',{method:'POST',body:JSON.stringify({name,category,address,geocode:{lat,lng}})}));
    }
    if (req.method === 'POST' && req.url === '/api/admin/accounts') {
      await currentAdmin(req);
      const { customerId, nickname, type, balance } = await body();
      await adminCustomer(customerId);
      if (balance != null) throw fault(400,'El saldo inicial se genera durante el registro; no envíes un saldo local.');
      return send(res,201,await provisionAccount(nessie,customerId,{nickname:requiredText(nickname,'Nombre de cuenta'),type},() => {}));
    }
    // Las operaciones de la consola se autorizan por empresa y cuenta antes de
    // entrar al flujo exclusivo para titulares de una empresa.
    const amount = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<=0||n>1e9) throw fault(400,"Usa un monto de 1 a 1,000,000,000 en dólares enteros."); return n; };
    const payload = (type,b) => {
      const status=b.status || (type==="bill"?"pending":"completed");
      if (!(type==="bill"?["pending","cancelled","completed","recurring"]:["pending","cancelled","completed"]).includes(status)) throw fault(400,"Estado inválido");
      const date=b.date;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) throw fault(400,"Fecha inválida");
      requiredText(b.description,'Descripción',250);
      if(type==="bill") {
        requiredText(b.payee,'Beneficiario',120);
        return {status,payee:String(b.payee).slice(0,120),nickname:String(b.description||"").slice(0,250),payment_amount:amount(b.amount),payment_date:date,recurring_date:new Date(date+"T12:00:00Z").getUTCDate()};
      }
      return {medium:"balance",status,amount:amount(b.amount),description:String(b.description||"").slice(0,250),[type==="purchase"?"purchase_date":"transaction_date"]:date,...(type==="purchase"?{merchant_id:id(b.merchantId)}:{})};
    };
    const kinds={deposit:"deposits",withdrawal:"withdrawal",purchase:"purchase",bill:"bills"};
    if (req.method === 'POST' && req.url === '/api/admin/movements') {
      const b = await body(), { accountId, type } = b;
      await adminAccount(accountId);
      if (type === 'transfer') throw fault(501,'Las transferencias no están habilitadas. No se ha enviado ninguna operación.');
      if (!Object.hasOwn(kinds,type)) throw fault(400,'Tipo no permitido');
      return send(res,201,await nessie('/accounts/'+id(accountId)+'/'+type+'s',{method:'POST',body:JSON.stringify(payload(type,b))}));
    }
    const adminDeleteAccount = req.url.match(/^\/api\/admin\/accounts\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'DELETE' && adminDeleteAccount) {
      await adminAccount(adminDeleteAccount[1]);
      return send(res,200,await nessie('/accounts/' + adminDeleteAccount[1],{method:'DELETE'}));
    }
    // Todo lo demás exige sesión y comprueba pertenencia en el servidor.
    const user = await currentUser(req);
    if (req.method === 'GET' && req.url === '/api/auth/me') return send(res,200,await readIdentity(user));
    const ownCustomer = customerId => {
      if (customerId !== user.customerId) throw fault(403, 'No tienes acceso a esa empresa.');
    };
    const ownAccounts = () => auth.accountsForUser(user);
    const ownAccount = async accountId => {
      const listed = await auth.accountForUser(user, accountId);
      if (!listed) throw fault(403, 'No tienes acceso a esa cuenta.');
      return listed;
    };
    const dashboard = req.url.match(/^\/api\/dashboard\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'GET' && dashboard) {
      const accountId = dashboard[1];
      const account = await ownAccount(accountId);
      const [synced, merchants, state] = await Promise.all([syncAccount(account), nessie('/merchants'), insightStore.read(account.id)]);
      const insights = analyzeAccount(synced.movements, merchants, synced.account.balance, state);
      return send(res,200,{ account:toRemoteAccount(synced.account), movements:synced.movements, insights });
    }
    const goal = req.url.match(/^\/api\/insights\/([a-zA-Z0-9-]+)\/goal$/);
    if (req.method === 'PUT' && goal) {
      const account = await ownAccount(goal[1]);
      return send(res,200,{ goal: await insightStore.goal(account.id,await body()) });
    }
    const review = req.url.match(/^\/api\/insights\/([a-zA-Z0-9-]+)\/reviews\/([a-f0-9]{24})$/);
    if (req.method === 'PUT' && review) {
      const account = await ownAccount(review[1]);
      const [synced, merchants, state] = await Promise.all([syncAccount(account),nessie('/merchants'),insightStore.read(account.id)]);
      const analysis = analyzeAccount(synced.movements, merchants, synced.account.balance, state);
      if (!analysis.alerts.some(a => a.id === review[2])) throw fault(404,'La alerta no existe en esta cuenta.');
      await insightStore.review(account.id,review[2],(await body()).status);
      return send(res,200,{ ok: true });
    }
    const match=req.url.match(/^\/api\/movements\/(deposit|withdrawal|purchase|bill)\/([a-zA-Z0-9-]+)$/);
    if(match && ["PUT","DELETE"].includes(req.method)) {
      const accounts = await ownAccounts();
      let owned = null;
      for (const account of accounts) {
        const rows = await nessie('/accounts/' + account.nessieId + '/' + match[1] + 's');
        if (rows.some(m => m._id === match[2])) { owned = account; break; }
      }
      if (!owned) throw fault(403, 'No tienes acceso a ese movimiento.');
      const data=req.method==="PUT"?payload(match[1],await body()):null;
      if(data && match[1]==="purchase") {delete data.merchant_id;delete data.status;}
      const response = await nessie("/"+kinds[match[1]]+"/"+id(match[2]),{method:req.method,...(data?{body:JSON.stringify(data)}:{})});
      await syncAccount(owned);
      return send(res,200,response);
    }
    if(req.method==="DELETE" && /^\/api\/accounts\/[^/]+$/.test(req.url)) {
      const accountId = id(req.url.split('/').pop()); const account = await ownAccount(accountId);
      const response = await nessie('/accounts/' + accountId,{method:'DELETE'});
      await auth.deleteAccount(account.id);
      return send(res,200,response);
    }
    if(req.method==="GET" && req.url==="/api/merchants") return send(res,200,await nessie("/merchants"));
    if(req.method==="POST" && req.url==="/api/merchants") {
      const b=await body(), name=requiredText(b.name,'Nombre del comercio'), category=requiredText(b.category,'Categoría'), address=addressInput(b.address);
      const lat=Number(b.lat), lng=Number(b.lng);
      if(b.lat == null || b.lng == null || b.lat === '' || b.lng === '' || !Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw fault(400,'Coordenadas inválidas.');
      return send(res,201,await nessie('/merchants',{method:'POST',body:JSON.stringify({name,category,address,geocode:{lat,lng}})}));
    }
    if (req.method === "GET" && req.url === "/api/customers") return send(res, 200, [user.customerRaw || { _id: user.customerId, first_name: user.customerName }]);
    if (req.method === "POST" && req.url === "/api/customers") {
      throw fault(403, 'Registra una empresa desde el formulario de registro.');
    }
    if (req.method === "GET" && req.url.startsWith("/api/accounts/")) {
      const customerId = req.url.split("/").pop();
      ownCustomer(customerId);
      return send(res, 200, (await ownAccounts()).map(toRemoteAccount));
    }
    if (req.method === "GET" && req.url.startsWith("/api/movements/")) {
      const accountId = req.url.split("/").pop();
      const account = await ownAccount(accountId);
      return send(res, 200, (await syncAccount(account)).movements);
    }
    if (req.method === "POST" && req.url === "/api/accounts") {
      const { customerId, nickname, type, balance } = await body();
      ownCustomer(customerId || user.customerId);
      if (balance != null) throw fault(400,'El saldo inicial se genera durante el registro; no envíes un saldo local.');
      const created = await provisionAccount(nessie,user.customerId,{nickname:requiredText(nickname,'Nombre de cuenta'),type},account=>auth.linkAccount(user,account));
      const account = await auth.accountForUser(user, created.objectCreated._id);
      if (account) await syncAccount(account);
      return send(res,201,created);
    }
    if (req.method === "POST" && req.url === "/api/bootstrap") {
      throw fault(410, 'Usa el registro con usuario y contraseña.');
    }
    if (req.method === "POST" && req.url === "/api/movements") {
      const b=await body(), {accountId,type}=b;
      const account = await ownAccount(accountId);
      if (type === 'transfer') throw fault(501,'Las transferencias no están habilitadas. No se ha enviado ninguna operación.');
      if (!Object.hasOwn(kinds,type)) return send(res,400,{error:"Tipo no permitido"});
      const created = await nessie("/accounts/"+id(accountId)+"/"+type+"s",{method:"POST",body:JSON.stringify(payload(type,b))});
      await syncAccount(account);
      return send(res,201,created);
    }
    send(res, 404, { error: "Ruta no encontrada." });
   } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After',String(error.retryAfter));
    send(res,error.status || 502,{error:error.message,requestId:nessieTrace.getStore().requestId,...(error.retryAfter ? {retryAfter:error.retryAfter} : {})});
  }
})).listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log("Busynessy backend listo en loopback"));
