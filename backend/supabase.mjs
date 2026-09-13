import { createClient } from '@supabase/supabase-js';

const now = () => new Date().toISOString();

export function databaseFault(error, fallback = 'No se pudo guardar la información.') {
  if (!error) return null;
  if (error.code === '23505') return Object.assign(Error('Este registro ya existe.'), { status: 409 });
  if (error.code === '23503') return Object.assign(Error('No se pudo relacionar la información solicitada.'), { status: 409 });
  console.error('[database]', error.code || 'error', error.message || 'unknown');
  return Object.assign(Error(fallback), { status: 503 });
}

const result = async (query, fallback) => {
  const response = await query;
  if (response.error) throw databaseFault(response.error, fallback);
  return response.data;
};

export function createSupabase(url, key) {
  if (!url || !key || url === 'https://your-project.supabase.co' || key.startsWith('replace_')) {
    throw Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el backend.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

const accountShape = account => ({
  id: account.id, nessieId: account.nessie_id, type: account.type, nickname: account.nickname,
  balance: Number(account.balance), raw: account.raw, syncedAt: account.synced_at,
});

export const toRemoteAccount = row => row.raw && typeof row.raw === 'object'
  ? row.raw
  : { _id: row.nessie_id, type: row.type, nickname: row.nickname, balance: Number(row.balance) };

export function createDataStore(supabase) {
  async function profileByClerkId(clerkId) {
    return result(supabase.from('profiles').select('id,clerk_user_id,username').eq('clerk_user_id', clerkId).maybeSingle(), 'No se pudo consultar tu perfil.');
  }
  async function hydrate(profile) {
    if (!profile) return null;
    const customer = await result(supabase.from('customers').select('id,nessie_id,name,raw,synced_at').eq('profile_id', profile.id).maybeSingle(), 'No se pudo consultar tu empresa.');
    const accounts = customer ? await result(supabase.from('accounts').select('id,nessie_id,type,nickname,balance,raw,synced_at').eq('customer_id', customer.id).order('created_at'), 'No se pudieron consultar tus cuentas.') : [];
    return { id: profile.id, clerkId: profile.clerk_user_id, username: profile.username, customerId: customer?.nessie_id || null, customerLocalId: customer?.id || null, customerName: customer?.name || '', customerRaw: customer?.raw || null, accountIds: accounts.map(account => account.nessie_id), accounts: accounts.map(accountShape) };
  }
  async function accountForUser(user, nessieId) {
    if (!user?.customerLocalId) return null;
    const account = await result(supabase.from('accounts').select('id,nessie_id,type,nickname,balance,raw,synced_at').eq('customer_id', user.customerLocalId).eq('nessie_id', nessieId).maybeSingle(), 'No se pudo verificar la cuenta.');
    return account ? accountShape(account) : null;
  }
  async function createProfile(clerkId, username) {
    const existing = await profileByClerkId(clerkId);
    if (existing) return existing;
    try {
      return await result(supabase.from('profiles').insert({ clerk_user_id: clerkId, username }).select('id,clerk_user_id,username').single(), 'No se pudo crear tu perfil.');
    } catch (error) {
      if (error.status !== 409) throw error;
      const raced = await profileByClerkId(clerkId);
      if (!raced) throw error;
      return raced;
    }
  }
  return {
    async findByClerkId(clerkId) { return hydrate(await profileByClerkId(clerkId)); },
    async registerClerk(input, provision) {
      const clerkId = String(input?.clerkId || '').trim();
      const username = String(input?.username || '').trim().toLowerCase().slice(0, 100) || clerkId;
      if (!clerkId) throw Object.assign(Error('No se pudo identificar la sesión.'), { status: 401 });
      const linked = await this.findByClerkId(clerkId);
      if (linked?.customerId) throw Object.assign(Error('Esta cuenta ya tiene una empresa vinculada.'), { status: 409 });
      let user = linked || { id: null, clerkId, username, customerId: null, customerLocalId: null, customerName: '', accountIds: [], accounts: [] };
      const linkCustomer = async (customer, name) => {
        if (!customer?._id) throw Object.assign(Error('No se confirmó el cliente creado.'), { status: 502 });
        const profile = await createProfile(clerkId, username);
        const stored = await result(supabase.from('customers').upsert({ profile_id: profile.id, nessie_id: customer._id, name: String(name || customer.first_name || 'Empresa').slice(0, 100), raw: customer, synced_at: now() }, { onConflict: 'nessie_id' }).select('id,nessie_id,name,raw').single(), 'No se pudo vincular tu empresa.');
        user = { ...user, id: profile.id, customerId: stored.nessie_id, customerLocalId: stored.id, customerName: stored.name, customerRaw: stored.raw };
      };
      const linkAccount = async account => {
        if (!user.customerLocalId || !account?._id) throw Object.assign(Error('No se pudo vincular la cuenta creada.'), { status: 502 });
        const stored = await result(supabase.from('accounts').upsert({ customer_id: user.customerLocalId, nessie_id: account._id, type: account.type || 'Checking', nickname: account.nickname || 'Cuenta operativa', balance: Number(account.balance || 0), raw: account, synced_at: now() }, { onConflict: 'nessie_id' }).select('id,nessie_id,type,nickname,balance,raw,synced_at').single(), 'No se pudo vincular la cuenta creada.');
        const shape = accountShape(stored);
        user = { ...user, accountIds: [...new Set([...user.accountIds, shape.nessieId])], accounts: [...user.accounts.filter(row => row.nessieId !== shape.nessieId), shape] };
        return shape;
      };
      const resultData = await provision(linkCustomer, linkAccount);
      return { user, result: resultData };
    },
    accountForUser,
    async linkAccount(user, account) {
      if (!user?.customerLocalId || !account?._id) throw Object.assign(Error('No se pudo vincular la cuenta creada.'), { status: 502 });
      const stored = await result(supabase.from('accounts').upsert({ customer_id: user.customerLocalId, nessie_id: account._id, type: account.type || 'Checking', nickname: account.nickname || 'Cuenta operativa', balance: Number(account.balance || 0), raw: account, synced_at: now() }, { onConflict: 'nessie_id' }).select('id,nessie_id,type,nickname,balance,raw,synced_at').single(), 'No se pudo vincular la cuenta creada.');
      const shape = accountShape(stored);
      user.accountIds = [...new Set([...(user.accountIds || []), shape.nessieId])];
      user.accounts = [...(user.accounts || []).filter(row => row.nessieId !== shape.nessieId), shape];
      return shape;
    },
    async accountsForUser(user) {
      if (!user?.customerLocalId) return [];
      const rows = await result(supabase.from('accounts').select('id,nessie_id,type,nickname,balance,raw,synced_at').eq('customer_id', user.customerLocalId).order('created_at'), 'No se pudieron consultar tus cuentas.');
      return rows.map(accountShape);
    },
    async updateAccount(accountId, remote) {
      const row = await result(supabase.from('accounts').update({ type: remote.type || 'Checking', nickname: remote.nickname || 'Cuenta operativa', balance: Number(remote.balance || 0), raw: remote, synced_at: now() }).eq('id', accountId).select('id,nessie_id,type,nickname,balance,raw,synced_at').single(), 'No se pudo actualizar la cuenta.');
      return accountShape(row);
    },
    async deleteAccount(accountId) { await result(supabase.from('accounts').delete().eq('id', accountId), 'No se pudo eliminar la cuenta local.'); },
    async upsertMovements(accountId, rows) {
      const existing = await result(supabase.from('movements').select('nessie_id').eq('account_id', accountId), 'No se pudo consultar los movimientos.');
      const existingIds = new Set(existing.map(row => row.nessie_id));
      const payload = rows.map(row => ({ ...row, account_id: accountId, synced_at: now() }));
      if (payload.length) await result(supabase.from('movements').upsert(payload, { onConflict: 'nessie_id' }), 'No se pudieron sincronizar los movimientos.');
      const stale = [...existingIds].filter(id => !payload.some(row => row.nessie_id === id));
      if (stale.length) await result(supabase.from('movements').delete().eq('account_id', accountId).in('nessie_id', stale), 'No se pudieron depurar movimientos eliminados.');
      return { created: payload.filter(row => !existingIds.has(row.nessie_id)).length, updated: payload.filter(row => existingIds.has(row.nessie_id)).length };
    },
    async movementsForAccount(accountId) { return result(supabase.from('movements').select('nessie_id,type,amount,description,status,occurred_on,raw').eq('account_id', accountId).order('occurred_on').order('nessie_id'), 'No se pudieron leer los movimientos.'); },
    async startSync(accountId) { return result(supabase.from('sync_runs').insert({ account_id: accountId, status: 'running', started_at: now() }).select('id').single(), 'No se pudo iniciar la sincronización.'); },
    async finishSync(id, status, counts = {}, errorMessage = null) { await result(supabase.from('sync_runs').update({ status, records_created: counts.created || 0, records_updated: counts.updated || 0, error_message: errorMessage, finished_at: now() }).eq('id', id), 'No se pudo registrar la sincronización.'); },
  };
}
