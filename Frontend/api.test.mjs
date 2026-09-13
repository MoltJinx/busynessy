import test from 'node:test';
import assert from 'node:assert/strict';
import { presentText, presentResponse, request, normalizeMovements } from './src/api.js';

const forbidden = /nessie|sandbox|modo\s+(?:de\s+)?pruebas?|test[\s_-]*mode|demo[\s_-]*mode/i;

test('presentación elimina referencias internas sin agregar avisos', () => {
  for (const phrase of ['Nessie', 'NESSIE', 'Sandbox', 'SANDBOX', 'sandbox-account', 'modo prueba', 'modo de pruebas', 'test mode', 'TEST_MODE', 'demo-mode', 'modo demo']) {
    assert.doesNotMatch(presentText(`Servicio ${phrase}: solicitud rechazada.`), forbidden);
  }
  assert.equal(presentText('Nessie · Sandbox'), '');
  assert.equal(presentText('Cuenta generada por Nessie'), 'Cuenta generada por');
});

test('textos anidados de la API se adaptan sin mutar datos ni identificadores', () => {
  const raw = {
    customer: {_id:'sandbox-customer-id', first_name:'Ana', last_name:'Sandbox 1234', address:{street_name:'QA Sandbox 42'}},
    accounts:[{_id:'test-mode-account', customer_id:'sandbox-customer-id', nickname:'Nessie Sandbox', balance:9012}],
    insights:{warnings:['Sandbox no disponible'], events:[{label:'Cobro demo mode', amount:100, date:'2026-09-12', id:'sandbox-event'}], alerts:[{title:'Test mode', reason:'Sandbox rechazado', evidence:[{id:'demo-mode-id', description:'Compra sandbox'}]}]},
    warning:'Operación en sandbox registrada', requestId:'sandbox-trace', status:'completed',
  };
  const before = structuredClone(raw), result = presentResponse(raw);
  assert.deepEqual(raw, before);
  assert.equal(result.customer._id, raw.customer._id);
  assert.equal(result.accounts[0]._id, raw.accounts[0]._id);
  assert.equal(result.accounts[0].customer_id, raw.accounts[0].customer_id);
  assert.equal(result.accounts[0].balance, 9012);
  assert.equal(result.insights.events[0].id, 'sandbox-event');
  assert.equal(result.insights.events[0].date, '2026-09-12');
  assert.equal(result.insights.events[0].amount, 100);
  assert.equal(result.insights.alerts[0].evidence[0].id, 'demo-mode-id');
  assert.equal(result.requestId, 'sandbox-trace');
  assert.equal(result.status, 'completed');
  for (const text of [result.customer.last_name, result.customer.address.street_name, result.accounts[0].nickname, result.insights.warnings[0], result.insights.events[0].label, result.insights.alerts[0].title, result.insights.alerts[0].reason, result.insights.alerts[0].evidence[0].description, result.warning]) assert.doesNotMatch(text, forbidden);
});

test('request filtra errores y confirmaciones sin modificar lo enviado', async t => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({warning:'Sandbox: operación registrada', objectCreated:{_id:'sandbox-id'}}), {status:201});
  });
  const result = await request('accounts', {method:'POST', body:{nickname:'Mi sandbox', customerId:'sandbox-customer'}});
  assert.deepEqual(sent, {nickname:'Mi sandbox', customerId:'sandbox-customer'});
  assert.doesNotMatch(result.warning, forbidden);
  assert.equal(result.objectCreated._id, 'sandbox-id');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({error:'Sandbox: test mode no disponible', requestId:'sandbox-trace'}), {status:429, headers:{'Retry-After':'12'}}));
  await assert.rejects(request('accounts'), error => {
    assert.doesNotMatch(error.message, forbidden);
    return error.status === 429 && error.retryAfter === 12 && error.requestId === 'sandbox-trace';
  });
});

test('movimientos mantienen importes e IDs, incluso al normalizarlos directamente', () => {
  const [row] = normalizeMovements({deposits:[{_id:'original-id', amount:120, transaction_date:'2026-09-12', status:'completed', description:'Sandbox deposit'}],withdrawals:[],purchases:[],bills:[]}, 'original-account');
  assert.doesNotMatch(row.description, forbidden);
  assert.equal(row.id, 'original-id'); assert.equal(row.accountId, 'original-account'); assert.equal(row.amount, 120);
});
