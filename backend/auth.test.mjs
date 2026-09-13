import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthStore, publicUser } from './auth.mjs';

test('el vínculo de negocio se delega al almacén remoto', async () => {
  const remote = { async findByClerkId(id) { return id === 'user_1' ? { clerkId: id, username: 'empresa', customerId: 'customer-api', accountIds: ['account-api'] } : null; } };
  const auth = createAuthStore(remote);
  const user = await auth.findByClerkId('user_1');
  assert.deepEqual(publicUser(user), { id: 'user_1', username: 'empresa', companyId: 'customer-api', primaryAccountId: 'account-api' });
  assert.equal(await auth.findByClerkId('user_2'), null);
});

test('no acepta un almacén local o incompleto', () => {
  assert.throws(() => createAuthStore(null), /almacén de perfiles/i);
  assert.throws(() => createAuthStore({}), /almacén de perfiles/i);
});
