import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Datos controlados exclusivamente para las pruebas unitarias; no se envían a Nessie.
function historyPlan(accountId, start, now = new Date()) {
  start ||= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 7);
  const [year, month] = start.split('-').map(Number);
  const plan = [];
  for (let offset = 0; offset < 3; offset++) {
    const period = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    let sequence = 0;
    const add = (day, type, amount, label, extra = {}) => plan.push({
      accountId, type, amount, date: `${period}-${String(day).padStart(2, '0')}`, status: 'completed',
      description: `[QA-HIST-v1 ${period} ${++sequence}] ${label}`, ...extra,
    });
    for (const [index, day] of [2, 9, 16, 23].entries()) {
      add(day, 'deposit', 3100 + offset * 180 + index * 90, `Ventas semana ${index + 1}`);
    }
    add(1, 'bill', 1800, 'Renta mensual pagada', { payee: 'QA Arrendador' });
    add(15, 'withdrawal', 1800, 'Nómina primera quincena');
    add(28, 'withdrawal', 1800, 'Nómina segunda quincena');
    add(5, 'purchase', offset === 2 ? 129 : 79, 'Suscripción software', { merchant: 'QA Historial Software' });
    add(7, 'withdrawal', 240 + offset * 15, 'Servicios de electricidad');
    add(11, 'purchase', 650, 'Compra de inventario', { merchant: 'QA Historial Insumos' });
    add(offset === 2 ? 11 : 25, 'purchase', offset === 2 ? 650 : 700, 'Compra de inventario', { merchant: 'QA Historial Insumos' });
    add(20, 'purchase', offset === 2 ? 1350 : 150, 'Servicio de entregas', { merchant: 'QA Historial Logistica' });
  }
  return plan.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

import { analyzeAccount, createInsightStore } from './insights.mjs';

const now = new Date('2026-09-12T12:00:00Z');
const fixture = () => {
  const raw = { deposits: [], withdrawals: [], purchases: [], bills: [] };
  const merchants = [];
  for (const [i,r] of historyPlan('qa','2026-06').entries()) {
    if (r.merchant && !merchants.some(m => m._id === r.merchant)) merchants.push({ _id: r.merchant, name: r.merchant });
    raw[r.type + 's'].push({ _id: 'qa-' + i, status: r.status, description: r.description, nickname: r.description,
      merchant_id: r.merchant, payee: r.payee, amount: r.type === 'bill' ? undefined : r.amount,
      payment_amount: r.type === 'bill' ? r.amount : undefined,
      [r.type === 'bill' ? 'payment_date' : r.type === 'purchase' ? 'purchase_date' : 'transaction_date']: r.date });
  }
  return { raw, merchants };
};
test('historial demo detecta recurrencia, incremento, atípico y duplicado', () => {
  const { raw,merchants } = fixture();
  const data = analyzeAccount(raw,merchants,100000,{},now);
  assert.equal(data.enoughHistory,true);
  assert.deepEqual(data.months.map(m => m.count),[12,12,12]);
  assert.equal(data.recurring.length,6);
  const software = data.recurring.find(r => r.label.includes('Software'));
  assert.equal(software.previousAmount,79); assert.equal(software.amount,129); assert.equal(software.increased,true);
  assert.equal(data.alerts.filter(a => a.kind === 'unusual').length,1);
  assert.equal(data.alerts.filter(a => a.kind === 'duplicate').length,1);
  assert.equal(data.alerts.find(a => a.kind === 'duplicate').evidence.length,2);
  assert.equal(data.balance,100000);
  assert.equal(analyzeAccount(raw,merchants,0,{},now).balance,0);
});
test('sin historial no inventa estabilidad, recurrencias ni alertas', () => {
  const data = analyzeAccount({ deposits:[],withdrawals:[],purchases:[],bills:[] },[],1000,{},now);
  assert.equal(data.enoughHistory,false); assert.equal(data.variation,null);
  assert.equal(data.recurring.length,0); assert.equal(data.alerts.length,0);
});
test('cancelados, fechas inválidas y pendientes no inflan gastos completados', () => {
  const { raw,merchants } = fixture();
  const baseline = analyzeAccount(raw,merchants,100000,{},now);
  raw.withdrawals.push({ _id:'cancelled',amount:999999,status:'cancelled',transaction_date:'2026-08-02',description:'Cancelado' });
  raw.withdrawals.push({ _id:'invalid',amount:999999,status:'completed',transaction_date:'2026-02-31',description:'Inválido' });
  raw.bills.push({ _id:'pending',payment_amount:99000,status:'pending',payment_date:'2026-09-20',payee:'Pendiente' });
  const data = analyzeAccount(raw,merchants,100000,{},now);
  assert.equal(data.averageExpenses,baseline.averageExpenses); assert.equal(data.invalidCount,1);
  assert.equal(data.obligations,99000);
  assert.equal(data.alerts.length,baseline.alerts.length);
});
test('comercio nuevo requiere historial previo suficiente', () => {
  const { raw,merchants } = fixture();
  raw.purchases.push({ _id:'nuevo',merchant_id:'nuevo',amount:30,status:'completed',purchase_date:'2026-09-10',description:'Nuevo comercio' });
  const data = analyzeAccount(raw,merchants,0,{},now);
  assert.equal(data.alerts.filter(a => a.kind === 'new-merchant').length,1);
});
test('metas y revisiones persisten y se aíslan por empresa y cuenta', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(),'busynessy-insights-'));
  const filename = path.join(folder,'state.json');
  const store = createInsightStore(filename);
  const { raw,merchants } = fixture();
  const data = analyzeAccount(raw,merchants,0,{},now);
  const alertId = data.alerts[0].id;
  store.goal('company-a','account-a',{target:5000,saved:1000});
  store.review('company-a','account-a',alertId,'recognized');
  const restored = createInsightStore(filename);
  assert.equal(restored.read('company-a','account-a').goal.saved,1000);
  assert.equal(restored.read('company-b','account-a').goal.saved,0);
  assert.equal(restored.read('company-a','account-b').goal.saved,0);
  const next = analyzeAccount(raw,merchants,0,restored.read('company-a','account-a'),now);
  assert.equal(next.openAlerts,data.openAlerts - 1);
  assert.equal(next.alerts.find(a => a.id === alertId).status,'recognized');
  assert.throws(() => store.goal('a','b',{target:-1,saved:0}),e => e.status === 400);
  assert.throws(() => store.review('a','b','alert','blocked'),e => e.status === 400);
});
