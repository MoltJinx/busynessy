import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAuthStore } from './auth.mjs';

test('credenciales, cookie, persistencia y revocación de sesión', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'busynessy-auth-test-'));
  const filename = path.join(folder, 'auth.json');
  const auth = createAuthStore(filename);
  const password = 'Solo-Prueba-Local-2026';
  const { user } = await auth.register({ username: 'empresa-a', password, name: 'Empresa A' }, async link => { link('customer-a'); return {}; });
  assert.equal((await auth.login('EMPRESA-A', password)).customerId, 'customer-a');
  auth.linkAccount(user,'account-api'); auth.linkAccount(user,'account-api');
  assert.deepEqual(user.accountIds,['account-api']);
  await assert.rejects(auth.login('empresa-a', 'incorrecta'), e => e.status === 401);
  await assert.rejects(auth.login('no-existe', password), e => e.status === 401);
  await assert.rejects(auth.register({ username: 'empresa-a', password, name: 'Otro' }, async () => {}), e => e.status === 409);
  await assert.rejects(auth.register({ username: 'admin', password, name: 'Otro' }, async () => {}), e => e.status === 409);
  let cookie;
  const res = { setHeader(name, value) { if (name === 'Set-Cookie') cookie = value; } };
  auth.start(user, { headers: {} }, res);
  assert(cookie.includes('HttpOnly')); assert(cookie.includes('SameSite=Strict'));
  const req = { headers: { cookie: cookie.split(';')[0] } };
  assert.equal(auth.current(req).id, user.id);
  const saved = fs.readFileSync(filename, 'utf8');
  assert(!Object.hasOwn(JSON.parse(saved).users[0],'companyName'));
  assert(!saved.includes(password)); assert(!saved.includes(cookie.split(';')[0].split('=')[1]));
  const restarted = createAuthStore(filename);
  assert.equal(restarted.current(req).id, user.id);
  restarted.logout(req, res);
  assert.throws(() => restarted.current(req), e => e.status === 401);
  assert(cookie.includes('Max-Age=0'));
});

test('limita intentos de autenticación', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'busynessy-auth-rate-test-'));
  const auth = createAuthStore(path.join(folder, 'auth.json'));
  for (let i = 0; i < 15; i++) auth.throttle('local');
  assert.throws(() => auth.throttle('local'), e => e.status === 429);
});

test('la sesión administrativa no se confunde con una empresa', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'busynessy-admin-session-test-'));
  const auth = createAuthStore(path.join(folder, 'auth.json'));
  let cookie;
  const res = { setHeader(name, value) { if (name === 'Set-Cookie') cookie = value; } };
  auth.startAdmin({ headers: {} }, res);
  const req = { headers: { cookie: cookie.split(';')[0] } };
  assert.doesNotThrow(() => auth.currentAdmin(req));
  assert.throws(() => auth.current(req), error => error.status === 401);
  auth.logout(req, res);
  assert.throws(() => auth.currentAdmin(req), error => error.status === 401);
});
