// Migración única e idempotente de vínculos creados antes de Supabase.
// Lee archivos locales solo para trasladarlos; el servidor no los consulta.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createNessieClient } from './nessie.mjs';
import { createDataStore, createSupabase } from './supabase.mjs';

const env = {};
for (const file of ['../.env', '.env', '.env.clerk']) {
  const url = new URL(file, import.meta.url);
  if (fs.existsSync(url)) for (const line of fs.readFileSync(url, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
}
const legacyFile = fileURLToPath(new URL('./.data/auth.json', import.meta.url));
if (!fs.existsSync(legacyFile)) {
  console.log('No hay vínculos locales para migrar.');
  process.exit(0);
}

const supabase = createSupabase(process.env.SUPABASE_URL || env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
const store = createDataStore(supabase);
const nessie = createNessieClient({ key: process.env.NESSIE_API_KEY || env.NESSIE_API_KEY, baseUrl: process.env.NESSIE_API_BASE_URL || env.NESSIE_API_BASE_URL || 'https://prod-api.nessieisreal.com', auditFile: null });
const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
const rowsFor = raw => Object.entries({ deposits: 'deposit', withdrawals: 'withdrawal', purchases: 'purchase', bills: 'bill' }).flatMap(([resource, type]) => (raw[resource] || []).map(row => ({
  nessie_id: row._id, type, amount: Number(row.amount ?? row.payment_amount), description: String(row.description || row.nickname || row.payee || 'Sin descripción'), status: row.status || 'completed', occurred_on: row.transaction_date || row.purchase_date || row.payment_date, raw: row,
}))).filter(row => row.nessie_id && Number.isFinite(row.amount) && row.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on));

let importedProfiles = 0, importedAccounts = 0, importedMovements = 0, skipped = 0;
for (const legacyUser of legacy.users || []) {
  if (!legacyUser.clerkId || !legacyUser.customerId) { skipped++; continue; }
  const existing = await store.findByClerkId(legacyUser.clerkId);
  if (existing?.customerId) { skipped++; continue; }
  const customer = await nessie('/customers/' + legacyUser.customerId);
  const remoteAccounts = await nessie('/customers/' + legacyUser.customerId + '/accounts');
  const { user } = await store.registerClerk({ clerkId: legacyUser.clerkId, username: legacyUser.username }, async (linkCustomer, linkAccount) => {
    await linkCustomer(customer, legacyUser.companyName || customer.first_name || 'Empresa');
    for (const account of remoteAccounts) await linkAccount(account);
    return {};
  });
  importedProfiles++;
  for (const account of user.accounts) {
    const [remote, deposits, withdrawals, purchases, bills] = await Promise.all([
      nessie('/accounts/' + account.nessieId), nessie('/accounts/' + account.nessieId + '/deposits'), nessie('/accounts/' + account.nessieId + '/withdrawals'), nessie('/accounts/' + account.nessieId + '/purchases'), nessie('/accounts/' + account.nessieId + '/bills'),
    ]);
    await store.updateAccount(account.id, remote);
    const counts = await store.upsertMovements(account.id, rowsFor({ deposits, withdrawals, purchases, bills }));
    importedAccounts++;
    importedMovements += counts.created + counts.updated;
  }
}
console.log(JSON.stringify({ importedProfiles, importedAccounts, importedMovements, skipped }));
