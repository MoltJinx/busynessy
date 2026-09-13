import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, projectEvents } from './forecast.mjs';

const now = new Date('2026-09-12T12:00:00Z');
const history = () => ['06','07','08'].flatMap(month => [
  { id: month + '-in', date: `2026-${month}-20`, amount: 1000, status: 'completed', type: 'deposit', counterparty: 'sales', label: 'Ventas' },
  { id: month + '-out', date: `2026-${month}-15`, amount: 600, status: 'completed', type: 'bill', counterparty: 'rent', label: 'Renta' },
]);
test('30 días, saldo inicial sin sumar historial, mínimo y error histórico exactos', () => {
  const result = buildForecast(history(), 100, now);
  assert.equal(result.enoughHistory, true);
  assert.equal(result.scenarios.base.daily.length, 30);
  assert.equal(result.scenarios.base.closing, 500);
  assert.equal(result.scenarios.base.minimum, -500);
  assert.equal(result.scenarios.base.firstDeficit, '2026-09-15');
  assert.equal(result.scenarios.base.buffer, 500);
  assert.equal(result.backtest.cumulativeMAE, 0);
  assert.equal(result.backtest.baselineMAE, 0);
  assert.equal(result.backtest.grossWAPE, 0);
});
test('pendiente sustituye estimación una vez, cancelado no altera proyección', () => {
  const rows = [...history(), { id:'due',type:'bill',counterparty:'rent',label:'Renta',date:'2026-09-15',amount:700,status:'pending' },
    { id:'cancelled',type:'bill',counterparty:'rent',label:'Cancelado',date:'2026-09-15',amount:9999,status:'cancelled' }];
  const result = buildForecast(rows, 100, now);
  assert.equal(result.replacements, 1);
  assert.equal(result.scenarios.base.closing, 400);
  assert.equal(result.scenarios.base.daily.find(row => row.date === '2026-09-15').expenses, 700);
  assert.equal(result.scenarios.base.daily.find(row => row.date === '2026-09-20').income, 1000);
});
test('backtest no usa el mes reservado ni compromisos futuros al entrenar', () => {
  const rows = history(); rows.find(row => row.id === '08-in').amount = 5000;
  rows.push({ id:'future',type:'deposit',counterparty:'sales',label:'Futuro',date:'2026-09-20',amount:99999,status:'pending' });
  const result = buildForecast(rows, 0, now);
  assert.equal(result.backtest.predictedNet, 400);
  assert.equal(result.backtest.actualNet, 4400);
  assert(result.backtest.cumulativeMAE > 0);
  assert.deepEqual(result.backtest.train, ['2026-06','2026-07']);
});
test('sin historial no inventa ingresos; saldo ausente no se sustituye por cero', () => {
  const rows = [{ id:'late',type:'bill',counterparty:'x',label:'Vencido',date:'2026-09-01',amount:50,status:'pending' },
    { id:'late-in',type:'deposit',counterparty:'y',label:'Cobro',date:'2026-09-01',amount:200,status:'pending' }];
  const result = buildForecast(rows, 100, now);
  assert.equal(result.enoughHistory, false); assert.equal(result.backtest, null);
  assert.equal(result.estimatedCount, 0); assert.equal(result.scenarios.base.closing, 50);
  assert.equal(result.scenarios.base.daily[0].expenses, 50);
  assert.equal(buildForecast(rows, null, now).scenarios, null);
});
test('fin de mes, cambio de año y facturas recurrentes respetan calendario', () => {
  const row = { id:'monthly',type:'bill',counterparty:'rent',label:'Mensual',date:'2025-11-30',recurringDay:31,amount:90,status:'recurring' };
  const result = buildForecast([row], 100, new Date('2025-12-15T00:00:00Z'));
  assert.equal(result.end, '2026-01-14');
  assert.equal(result.events[0].date, '2025-12-31');
  assert.equal(buildForecast([row],100,new Date('2026-02-01')).events[0].date, '2026-02-28');
});
test('calcula centavos sin introducir incrementos ni descuentos arbitrarios', () => {
  const result = projectEvents([{date:'2026-09-30',type:'deposit',amount:123.45,source:'known'}],10,'2026-09-01',30);
  assert.equal(result.closing,133.45);
});
