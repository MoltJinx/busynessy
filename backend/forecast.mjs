// Pronóstico explicable: perfil por día del mes + compromisos conocidos.
// Funciones puras: no escriben en Nessie, no entrenan con datos posteriores al corte.
const DAY = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const addDays = (date, count) => iso(new Date(Date.parse(date) + count * DAY));
const cents = value => Math.round(value * 100);
const usd = value => value / 100;
const monthAt = (today, offset) => {
  const date = new Date(today);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))).slice(0, 7);
};
const dated = (month, day) => {
  const [year, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, m, 0)).getUTCDate())).padStart(2, '0')}`;
};
const groupKey = row => row.type + ':' + row.counterparty;

function profile(rows, months) {
  const slots = new Map();
  for (const row of rows.filter(row => months.includes(row.date.slice(0, 7)))) {
    const day = Number(row.date.slice(-2));
    const key = groupKey(row) + ':' + day;
    const slot = slots.get(key) || { type: row.type, counterparty: row.counterparty, label: row.label, day, total: 0, evidence: [] };
    slot.total += cents(row.amount); slot.evidence.push(row.id); slots.set(key, slot);
  }
  // Dividir entre todos los meses (también los ceros) conserva el gasto medio.
  return [...slots.values()].map(slot => ({ ...slot, amount: usd(Math.round(slot.total / months.length)) }));
}

function estimatedEvents(slots, start, end) {
  const months = [...new Set(Array.from({ length: Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1 }, (_, i) => addDays(start, i).slice(0, 7)))];
  return months.flatMap(month => slots.map(slot => ({ ...slot, date: dated(month, slot.day), source: 'estimated' })))
    .filter(row => row.date >= start && row.date <= end && row.amount > 0);
}

export function projectEvents(events, balance, start, days) {
  let running = cents(balance);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const matches = events.filter(row => row.date === date);
    const incoming = matches.filter(row => row.type === 'deposit').reduce((s, row) => s + cents(row.amount), 0);
    const outgoing = matches.filter(row => row.type !== 'deposit').reduce((s, row) => s + cents(row.amount), 0);
    running += incoming - outgoing;
    return { date, income: usd(incoming), expenses: usd(outgoing), balance: usd(running) };
  });
  const minimum = Math.min(balance, ...daily.map(row => row.balance));
  return { daily, closing: daily.at(-1).balance, minimum,
    firstDeficit: balance < 0 ? addDays(start, -1) : daily.find(row => row.balance < 0)?.date || null,
    buffer: Math.max(0, -minimum),
  };
}

function backtest(completed, months) {
  const holdout = months.at(-1);
  const train = months.slice(0, -1);
  if (train.length < 2) return null;
  const start = holdout + '-01';
  const end = dated(holdout, 31);
  const days = Number(end.slice(-2));
  const actual = completed.filter(row => row.date.startsWith(holdout));
  const model = projectEvents(estimatedEvents(profile(completed, train), start, end), 0, start, days);
  const naive = projectEvents(estimatedEvents(profile(completed, train.slice(-1)), start, end), 0, start, days);
  const truth = projectEvents(actual.map(row => ({ ...row, source: 'known' })), 0, start, days);
  const mae = prediction => usd(Math.round(prediction.daily.reduce((s, row, i) => s + Math.abs(cents(row.balance) - cents(truth.daily[i].balance)), 0) / days));
  const gross = actual.reduce((s, row) => s + cents(row.amount), 0);
  const error = model.daily.reduce((s, row, i) => s + Math.abs(cents(row.income) - cents(truth.daily[i].income)) + Math.abs(cents(row.expenses) - cents(truth.daily[i].expenses)), 0);
  return { train, holdout, days, predictedNet: model.closing, actualNet: truth.closing,
    cumulativeMAE: mae(model), baselineMAE: mae(naive), grossWAPE: gross ? Math.round(error / gross * 1000) / 10 : null,
    // Solo un mes de validación: no es una probabilidad de acierto ni validación externa.
    method: 'Mes cerrado reservado; entrenamiento solo en meses anteriores. Referencia: repetir el último mes de entrenamiento.' };
}

export function buildForecast(rows, balance, now = new Date()) {
  const today = iso(now), start = addDays(today, 1), end = addDays(today, 30);
  const months = [-3, -2, -1].map(offset => monthAt(today, offset));
  const completed = rows.filter(row => row.status === 'completed' && row.date <= today);
  const training = completed.filter(row => months.includes(row.date.slice(0, 7)));
  const enoughHistory = months.every(month => training.some(row => row.date.startsWith(month) && row.type === 'deposit') && training.some(row => row.date.startsWith(month) && row.type !== 'deposit'));
  const validBalance = typeof balance === 'number' && Number.isFinite(balance);
  const warnings = [];
  if (!enoughHistory) warnings.push('Faltan ingresos o gastos en alguno de los tres meses anteriores. Se muestran solo compromisos conocidos, no un pronóstico completo.');
  if (!validBalance) warnings.push('No se recibió un saldo válido. No se calculan saldos futuros.');
  const estimated = enoughHistory ? estimatedEvents(profile(training, months), start, end) : [];
  const known = [];
  for (const row of rows.filter(row => ['pending', 'recurring'].includes(row.status))) {
    if (row.status === 'recurring' && row.type === 'bill') {
      for (const month of [...new Set([start.slice(0, 7), end.slice(0, 7)])]) {
        const date = dated(month, row.recurringDay || Number(row.date.slice(-2)));
        if (date >= start && date <= end && date >= row.date) known.push({ ...row, date, source: 'known' });
      }
    } else if (row.date <= end) {
      if (row.date <= today && row.type === 'deposit') { warnings.push('Hay ingresos pendientes vencidos: no se supone su cobro. Confirma la fecha.'); continue; }
      known.push({ ...row, originalDate: row.date, date: row.date < start ? start : row.date, source: 'known' });
    }
  }
  const overdue = known.filter(row => row.originalDate && row.originalDate <= today);
  if (overdue.length) warnings.push(`${overdue.length} pagos pendientes vencidos o de hoy se provisionan mañana; confirma su fecha real.`);
  // Un compromiso sustituye una sola estimación de igual tipo/contraparte y fecha ±3 días.
  // La conciliación es heurística; IDs distintos nunca se eliminan del historial.
  let replacements = 0;
  for (const row of known) {
    const index = estimated.findIndex(item => groupKey(item) === groupKey(row) && Math.abs(Date.parse(item.date) - Date.parse(row.date)) <= 3 * DAY);
    if (index >= 0) { estimated.splice(index, 1); replacements++; }
  }
  const futureCompleted = rows.filter(row => row.status === 'completed' && row.date > today).length;
  if (futureCompleted) warnings.push(`${futureCompleted} registros completados con fecha futura excluidos; revisa la calidad del historial.`);
  const events = [...known, ...estimated].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const scenarios = validBalance ? {
    base: projectEvents(events, balance, start, 30),
  } : null;
  return { version: 'calendar-profile-v1', today, start, end, months, enoughHistory,
    balance: validBalance ? balance : null, trainingCount: training.length, knownCount: known.length,
    estimatedCount: estimated.length, replacements, events, scenarios, warnings: [...new Set(warnings)],
    backtest: enoughHistory ? backtest(completed, months) : null,
    latestCompleted: completed.at(-1)?.date || null,
    scope: 'Cuenta seleccionada; no consolida otras cuentas ni modela transferencias, impuestos o compromisos no registrados.',
  };
}
