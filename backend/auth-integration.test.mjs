// Opt-in: conserva dos empresas QA para comprobar separación real en Nessie.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
if (!process.argv.includes('--sandbox-write')) throw Error('Usa --sandbox-write para autorizar los registros QA.');
const origin = 'http://127.0.0.1:5173';
const call = async (route, cookie = '', method = 'GET', body) => {
  const response = await fetch('http://127.0.0.1:8787/api/' + route, {
    method, signal: AbortSignal.timeout(120000),
    headers: { Origin: origin, 'X-Busynessy-Request': '1', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
const suffix = Date.now();
const password = randomBytes(24).toString('hex');
assert.equal((await call('customers')).status, 401);
assert.equal((await call('auth/me')).status, 401);
const register = async tag => {
  const result = await call('auth/register', '', 'POST', { username: `qa-${tag}-${suffix}`, password, name: `QA Aislamiento ${tag} ${suffix}`, firstName:'QA',lastName:tag,address:{street_number:'1',street_name:'QA Validacion',city:'Austin',state:'TX',zip:'78701'} });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert(result.data.account?._id);
  assert(result.cookie);
  assert.equal(Object.values((await call('movements/' + result.data.account._id,result.cookie)).data).flat().length,3);
  console.log(`PASS registro ${tag}: cuenta y tres movimientos vía API`);
  return result;
};
const a = await register('a');
const b = await register('b');
assert.notEqual(a.data.user.companyId, b.data.user.companyId);
const companies = await call('customers', a.cookie);
assert.equal(companies.status, 200);
assert.equal(companies.data.length, 1);
assert.equal(companies.data[0]._id, a.data.user.companyId);
assert.equal((await call('accounts/' + b.data.user.companyId, a.cookie)).status, 403);
assert.equal((await call('movements/' + b.data.account._id, a.cookie)).status, 403);
assert.equal((await call('dashboard/' + b.data.account._id, a.cookie)).status, 403);
assert.equal((await call('insights/' + b.data.account._id + '/goal', a.cookie, 'PUT', {target:1000,saved:0})).status, 403);
assert.equal((await call('insights/' + b.data.account._id + '/reviews/' + 'a'.repeat(24), a.cookie, 'PUT', {status:'recognized'})).status, 403);
assert.equal((await call('accounts', a.cookie, 'POST', { customerId: b.data.user.companyId, nickname: 'No debe crearse' })).status, 403);
assert.equal((await call('accounts/' + b.data.account._id, a.cookie, 'DELETE')).status, 403);
assert.equal((await call('movements', a.cookie, 'POST', { accountId: b.data.account._id, type: 'deposit', amount: 1, description: 'No debe crearse' })).status, 403);
const bh = await call('movements/' + b.data.account._id, b.cookie);
assert.equal(Object.values(bh.data).flat().length, 3);
const foreignMovement = 'unowned-resource';
assert.equal((await call('movements/deposit/' + foreignMovement, a.cookie, 'PUT', { amount: 1 })).status, 403);
assert.equal((await call('movements/deposit/' + foreignMovement, a.cookie, 'DELETE')).status, 403);
console.log('PASS aislamiento: listas, lectura, alta, edición y eliminación ajenas bloqueadas');
assert.equal((await call('auth/login', '', 'POST', { username: `qa-a-${suffix}`, password: 'Incorrecta-123' })).status, 401);
const login = await call('auth/login', a.cookie, 'POST', { username: `qa-a-${suffix}`, password });
assert.equal(login.status, 200);
assert.equal((await call('auth/me', a.cookie)).status, 401); // Rotación de la cookie anterior.
assert.equal((await call('auth/me', login.cookie)).data.user.companyId, a.data.user.companyId);
assert.equal((await call('auth/logout', login.cookie, 'POST')).status, 200);
assert.equal((await call('customers', login.cookie)).status, 401);
assert.equal((await call('movements/' + b.data.account._id, b.cookie)).status, 200);
await call('auth/logout', b.cookie, 'POST');
console.log('PASS contraseña incorrecta, rotación, logout y sesiones independientes');
