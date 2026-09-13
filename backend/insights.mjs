import { createHash } from 'node:crypto';
import { buildForecast } from './forecast.mjs';

const round = value => Math.round(value * 100) / 100;
const sum = rows => round(rows.reduce((total, row) => total + row.amount, 0));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2 : 0;
};
const groups = (rows, key) => {
  const result = new Map();
  for (const row of rows) { const k = key(row); result.set(k, [...(result.get(k) || []), row]); }
  return result;
};
const textKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const monthIndex = date => Number(date.slice(0,4)) * 12 + Number(date.slice(5,7));
const usd = amount => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(amount);

// Reglas de análisis explicables. No determinan fraude ni solvencia crediticia.
export function analyzeAccount(raw, merchantRows = [], balance = null, state = {}, now = new Date()) {
  const merchantMap = new Map(merchantRows.map(m => [m._id, m]));
  let invalidCount = 0;
  const today = now.toISOString().slice(0,10);
  const rows = Object.entries({ deposits: 'deposit', withdrawals: 'withdrawal', purchases: 'purchase', bills: 'bill' }).flatMap(([resource, type]) => {
    if (!Array.isArray(raw[resource])) throw Error('Historial incompleto: ' + resource);
    return raw[resource].flatMap(row => {
      const date = row.transaction_date || row.purchase_date || row.payment_date || '';
      const amount = Number(row.amount ?? row.payment_amount);
      if (!row._id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) { invalidCount++; return []; }
      const description = String(row.description || row.nickname || row.payee || 'Sin descripción').replace(/^\[QA-HIST-v1 [^\]]+\]\s*/, '');
      const merchant = merchantMap.get(row.merchant_id);
      const counterparty = row.merchant_id ? 'merchant:' + row.merchant_id : textKey(row.payee || description.split(' — ')[0]);
      return [{ id: row._id, type, amount, date, status: row.status, description, counterparty,
        recurringDay: Number.isInteger(row.recurring_date) && row.recurring_date >= 1 && row.recurring_date <= 31 ? row.recurring_date : null,
        merchantId: row.merchant_id, category: merchant?.category, label: merchant?.name || row.payee || description }];
    });
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const completed = rows.filter(r => r.status === 'completed' && r.date <= today);
  const expenses = completed.filter(r => r.type !== 'deposit');
  const eligible = rows.filter(r => ['completed','pending'].includes(r.status) && r.date <= today);
  const recurring = [];
  for (const [key, history] of groups(expenses, r => r.type + ':' + r.counterparty)) {
    const monthly = [...groups(history, r => r.date.slice(0,7)).values()].slice(-3);
    if (monthly.length < 3 || monthly.some(month => month.length !== 1)) continue;
    const series = monthly.flat();
    if (series.some((r, i) => i && monthIndex(r.date) - monthIndex(series[i - 1].date) !== 1)) continue;
    if (Math.max(...series.map(r => Number(r.date.slice(-2)))) - Math.min(...series.map(r => Number(r.date.slice(-2)))) > 5) continue;
    const latest = series.at(-1);
    const previous = median(series.slice(0,-1).map(r => r.amount));
    recurring.push({ id: key, label: latest.label, amount: latest.amount, previousAmount: previous,
      increasePercent: round((latest.amount - previous) / previous * 100), increased: latest.amount > previous * 1.2,
      lastDate: latest.date, evidence: series });
  }

  const months = Array.from({ length: 3 }, (_, i) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3 + i, 1)).toISOString().slice(0,7);
    const transactions = completed.filter(r => r.date.startsWith(month));
    const income = sum(transactions.filter(r => r.type === 'deposit'));
    const expense = sum(transactions.filter(r => r.type !== 'deposit'));
    return { month, income, expenses: expense, net: round(income - expense), count: transactions.length };
  });
  const enoughHistory = months.every(month => month.count > 0 && month.income > 0);
  const averageIncome = round(months.reduce((s,m) => s + m.income,0) / 3);
  const averageExpenses = round(months.reduce((s,m) => s + m.expenses,0) / 3);
  const variation = enoughHistory ? round((Math.max(...months.map(m => m.income)) - Math.min(...months.map(m => m.income))) / averageIncome * 100) : null;
  const deadline = new Date(now); deadline.setUTCDate(deadline.getUTCDate() + 30);
  // El total de obligaciones conocidas incluye los pagos vencidos.
  const obligations = sum(rows.filter(r => r.type !== 'deposit' && ['pending','recurring'].includes(r.status) && r.date <= deadline.toISOString().slice(0,10)));
  const bankBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : null;
  const monthlySurplus = round(averageIncome - averageExpenses);
  const alerts = [];
  const addAlert = (kind, severity, title, reason, evidence) => {
    const id = createHash('sha256').update(kind + ':' + evidence.map(r => r.id).sort().join('|')).digest('hex').slice(0,24);
    alerts.push({ id, kind, severity, title, reason, evidence, status: state.reviews?.[id]?.status || 'new', reviewedAt: state.reviews?.[id]?.updatedAt || null });
  };
  for (const history of groups(eligible, r => [r.type,r.counterparty,r.date,r.amount].join('|')).values()) {
    if (history.length > 1) addAlert('duplicate','medium',`Posible duplicado: ${history[0].description}`, `${history.length} movimientos de ${usd(history[0].amount)} en la misma fecha. Verifica si corresponden a operaciones distintas.`, history);
  }
  for (const history of groups(expenses, r => r.type + ':' + r.counterparty).values()) {
    for (const row of history) {
      const prior = history.filter(p => p.date < row.date).slice(-12);
      if (prior.length < 2) continue;
      const baseline = median(prior.map(p => p.amount));
      if (row.amount >= baseline * 3 && row.amount - baseline >= 100) addAlert('unusual','high',`Monto inusual: ${row.label}`, `${usd(row.amount)} frente a una mediana anterior de ${usd(baseline)} en ${prior.length} operaciones previas.`, [row]);
    }
  }
  for (const [merchantId, history] of groups(expenses.filter(r => r.merchantId), r => r.merchantId)) {
    const first = history[0];
    const prior = expenses.filter(r => r.merchantId && r.date < first.date);
    if (prior.length >= 10 && Date.parse(first.date) - Date.parse(prior[0].date) >= 30 * 86400000) {
      addAlert('new-merchant','low',`Primer cargo: ${first.label}`, `No aparece antes en el historial disponible. Había ${prior.length} compras anteriores en otros comercios.`, [first]);
    }
  }
  alerts.sort((a,b) => ({high:0,medium:1,low:2}[a.severity] - {high:0,medium:1,low:2}[b.severity]) || a.id.localeCompare(b.id));
  return {
    scope: 'selected-account', generatedAt: now.toISOString(), historyFrom: rows[0]?.date || null, historyTo: rows.at(-1)?.date || null,
    invalidCount, months, enoughHistory, averageIncome, averageExpenses, monthlySurplus, variation,
    balance: bankBalance, obligations,
    recurring, goal: state.goal || { target: 0, saved: 0 }, alerts,
    openAlerts: alerts.filter(a => a.status !== 'recognized').length,
    forecast: buildForecast(rows, balance, now),
  };
}

// Metas y revisiones son datos propios de la app, persistidos en Supabase.
export function createInsightStore(supabase) {
  const fail = (error, message) => {
    if (!error) return;
    console.error('[insights]', error.code || 'error', error.message || 'unknown');
    throw Object.assign(Error(message), { status: 503 });
  };
  return {
    async read(accountId) {
      const [goalResult, reviewsResult] = await Promise.all([
        supabase.from('account_goals').select('target,saved,updated_at').eq('account_id', accountId).maybeSingle(),
        supabase.from('alert_reviews').select('alert_id,status,updated_at').eq('account_id', accountId),
      ]);
      fail(goalResult.error, 'No se pudo leer la meta de la cuenta.');
      fail(reviewsResult.error, 'No se pudieron leer las alertas de la cuenta.');
      return {
        goal: goalResult.data ? { target: Number(goalResult.data.target), saved: Number(goalResult.data.saved), updatedAt: goalResult.data.updated_at } : { target: 0, saved: 0 },
        reviews: Object.fromEntries((reviewsResult.data || []).map(row => [row.alert_id, { status: row.status, updatedAt: row.updated_at }])),
      };
    },
    async goal(accountId, input) {
      if (![input.target,input.saved].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12)) throw Object.assign(Error('La meta y el ahorro registrado deben ser montos positivos o cero.'), { status: 400 });
      const updatedAt = new Date().toISOString();
      const { data, error } = await supabase.from('account_goals').upsert({ account_id: accountId, target: round(input.target), saved: round(input.saved), updated_at: updatedAt }, { onConflict: 'account_id' }).select('target,saved,updated_at').single();
      fail(error, 'No se pudo guardar la meta de la cuenta.');
      return { target: Number(data.target), saved: Number(data.saved), updatedAt: data.updated_at };
    },
    async review(accountId, alertId, status) {
      if (!['new','review','recognized'].includes(status)) throw Object.assign(Error('Estado de revisión inválido.'), { status: 400 });
      const { error } = await supabase.from('alert_reviews').upsert({ account_id: accountId, alert_id: alertId, status, updated_at: new Date().toISOString() }, { onConflict: 'account_id,alert_id' });
      fail(error, 'No se pudo guardar la revisión de la alerta.');
    },
  };
}
