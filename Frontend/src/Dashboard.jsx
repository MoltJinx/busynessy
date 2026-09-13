import React, { useRef, useState } from 'react';
import { AccessibilitySettings, Card, Field, Help, Icon, Metric, MovementTable, Table, Title } from './components.jsx';
import { money, totals, statuses } from './data.js';

const SECTIONS = [['summary','Resumen'],['movements','Movimientos'],['expenses','Gastos'],['forecast','Pronóstico'],['health','Salud financiera'],['security','Seguridad'],['alerts','Alertas'],['settings','Ajustes']];

export default function Dashboard({ company, movements, onLogout, accountControls, insights, accountId, busy, sessionBusy = false, onSaveGoal, onReview, ready = true }) {
  const [section,setSection] = useState('summary');
  const [query,setQuery] = useState('');
  const [status,setStatus] = useState('');
  const [menu,setMenu] = useState(false);
  const main = useRef(null);
  const navigate = next => { setSection(next); setMenu(false); requestAnimationFrame(() => main.current?.focus()); };
  const summary = totals(movements);
  const selected = movements.filter(row => (!status || row.status === status) && (row.description + ' ' + row.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  let view;
  if (section === 'movements') view = <MovementsView movements={selected} searchQuery={query} onSearchChange={setQuery} status={status} onStatusChange={setStatus}/>;
  else if (section === 'expenses') view = <ExpensesView completedExpenses={summary.expenses} movements={movements.filter(row => row.type !== 'deposit')}/>;
  else if (section === 'forecast') view = <ForecastView forecast={insights?.forecast}/>;
  else if (section === 'health') view = <HealthView insights={insights} accountId={accountId} busy={busy} onSaveGoal={onSaveGoal}/>;
  else if (section === 'security') view = <SecurityView insights={insights} busy={busy} onReview={onReview}/>;
  else if (section === 'alerts') view = <AlertsView pendingCount={movements.filter(row => row.status === 'pending').length} forecast={insights?.forecast} onForecast={() => navigate('forecast')}/>;
  else if (section === 'settings') view = <SettingsView/>;
  else view = <SummaryView summary={summary} movements={movements} forecast={insights?.forecast} onShowMovements={() => navigate('movements')} onForecast={() => navigate('forecast')}/>;

  return <div className="shell">
    <aside className={menu ? 'sidebar expanded' : 'sidebar'}>
      <div className="side-heading"><div className="brand"><img className="brand-logo" src="/Busynesy-logo.png" alt="Busynessy"/><small>FINANZAS EMPRESARIALES</small></div>
        <button className="menu-toggle" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="financial-navigation">Menú</button></div>
      <nav id="financial-navigation" aria-label="Panel financiero">
        {SECTIONS.map(([id,label]) => <button key={id} className={section === id ? 'selected' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon name={id}/>{label}</button>)}
      </nav>
      <div className="side-bottom"><button onClick={onLogout} disabled={sessionBusy}>Cerrar sesión</button></div>
    </aside>
    <main id="main-content" tabIndex="-1" ref={main}>
      <header className="page-heading"><div><p className="eyebrow">TU EMPRESA</p><h1>{company.name}</h1></div></header>
      <div className="account-strip">{accountControls}</div>
        {section === 'settings' || ready ? view : <Card><p role="status">Cargando información de tu cuenta…</p></Card>}
      <footer>BusyNessy · USD</footer>
    </main>
  </div>;
}

export function SummaryView({ summary, movements, forecast, onShowMovements, onForecast }) {
  const base = forecast?.scenarios?.base;
  return <>
    <Title help="Los ingresos y gastos incluyen operaciones completadas de todo el historial disponible.">Resumen financiero</Title>
    <div className="metrics">
      <Metric label="Saldo en cuenta" value={forecast?.balance == null ? 'No disponible' : money(forecast.balance)} primary help="El historial no se vuelve a sumar al saldo."/>
      <Metric label="Ingresos registrados" value={money(summary.income)} help="Depósitos completados del historial consultado."/>
      <Metric label="Gastos registrados" value={money(summary.expenses)} help="Compras, retiros y facturas completados. No incluye pendientes ni cancelados."/>
      <Metric label="Flujo neto" value={money(summary.net)} help="Ingresos menos gastos completados. No equivale al saldo de la cuenta."/>
    </div>
    <div className="overview-grid"><Card>
      <Title help="Cálculo de 30 días basado en el historial disponible y compromisos registrados. No garantiza el saldo futuro.">Próximos 30 días</Title>
      <p className="large-value">{base ? money(base.closing) : 'Pendiente de información'}</p>
      <span className="badge">{forecast?.enoughHistory ? 'Saldo proyectado' : 'Solo compromisos conocidos'}</span>
      {base?.firstDeficit && <p className="notice warning">Posible déficit el {base.firstDeficit}</p>}
      <button className="secondary" onClick={onForecast}>Ver pronóstico</button>
    </Card><Card><Title>Actividad de la cuenta</Title>
      <div className="stat-row"><span>Movimientos</span><strong>{movements.length}</strong></div>
      <div className="stat-row"><span>Pendientes</span><strong>{movements.filter(row => row.status === 'pending').length}</strong></div>
      <div className="stat-row"><span>Última fecha registrada</span><strong>{movements[0]?.date || 'Sin registros'}</strong></div>
    </Card></div>
    <Card><div className="section-heading"><h2>Últimos movimientos</h2><button className="secondary" onClick={onShowMovements}>Ver todos</button></div><MovementTable movements={movements.slice(0,5)}/></Card>
  </>;
}

export function MovementsView({ movements, searchQuery, onSearchChange, status = '', onStatusChange }) {
  return <><Title help="La aplicación y la consola consultan la misma cuenta. Cada operación conserva su referencia.">Movimientos</Title>
    <div className="filters"><Field label="Buscar movimiento"><input type="search" value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder="Descripción o referencia"/></Field>
      {onStatusChange && <Field label="Estado"><select value={status} onChange={event => onStatusChange(event.target.value)}><option value="">Todos</option>{Object.entries(statuses).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></Field>}</div>
    <Card><p className="result-count" role="status">{movements.length} {movements.length === 1 ? 'resultado' : 'resultados'}</p><MovementTable movements={movements}/></Card></>;
}

export function ExpensesView({ completedExpenses, movements }) {
  const grouped = new Map();
  for (const row of movements.filter(row => row.status === 'completed')) {
    const label = row.description.replace(/^\[QA-HIST-v1 [^\]]+\]\s*/, '');
    const item = grouped.get(label) || { label, cents:0, count:0 };
    item.cents += Math.round(row.amount*100); item.count++; grouped.set(label,item);
  }
  const groups = [...grouped.values()].sort((a,b) => b.cents-a.cents);
  return <><Title help="Distribución del historial completado por descripción. No representa una clasificación contable.">Análisis de gastos</Title>
    <Metric label="Gastos completados" value={money(completedExpenses)} help="Las facturas pendientes aparecen en el historial, pero no aumentan los gastos pagados."/>
    {!!groups.length && <Card><Table caption="Distribución de gastos" columns={['Concepto','Operaciones','Participación','Total USD']} rows={groups.map(row => [row.label,row.count,(completedExpenses ? row.cents/completedExpenses : 0).toFixed(1)+'%',money(row.cents/100)])}/></Card>}
    <Card><Title>Historial de salidas</Title><MovementTable movements={movements}/></Card></>;
}

export function ForecastView({ forecast: data }) {
  if (!data) return <Card><Title>Pronóstico de caja</Title><p>Selecciona una cuenta para consultar su proyección.</p></Card>;
  const result = data.scenarios?.base;
  return <><Title help="Perfil promedio por contraparte y día del mes de los tres meses anteriores, más pagos conocidos. Los pendientes sustituyen una estimación compatible a tres días de distancia; revisa coincidencias. No incluye transferencias, otras cuentas ni compromisos externos.">Pronóstico de caja</Title>
    <p className="period">{data.start} — {data.end}</p>
    {!data.enoughHistory && <div className="notice warning" role="status">Historial insuficiente. Solo se muestran compromisos registrados.<Help label="Historial requerido">Se necesitan entradas y salidas en cada uno de los tres meses anteriores para calcular el perfil histórico.</Help></div>}
    {data.warnings.filter(w => !w.startsWith('Faltan ingresos')).map(w => <p className="notice warning" key={w}>{w}</p>)}
    {result && <><div className="metrics">
      <Metric label="Saldo inicial" value={money(data.balance)} />
      <Metric label="Saldo proyectado" value={money(result.closing)} primary help="Saldo al final del horizonte, sujeto al comportamiento del historial y a los compromisos registrados."/>
      <Metric label="Mínimo de caja" value={money(result.minimum)}/>
      <Metric label="Déficit a cubrir" value={money(result.buffer)} help="Importe adicional para evitar saldos negativos dentro de este cálculo. No es una oferta de crédito."/>
    </div><Card><Title help="La línea horizontal marca saldo cero. La tabla siguiente ofrece todos los valores del gráfico.">Evolución diaria</Title>
      <p className={result.firstDeficit ? 'notice warning' : 'notice success'}>{result.firstDeficit ? 'Primer déficit previsto: ' + result.firstDeficit : 'Sin déficit en el horizonte calculado'}</p>
      <ForecastChart daily={result.daily} opening={data.balance}/>
    </Card>
    <Card><details><summary>Calendario de 30 días</summary><Table caption="Pronóstico diario en USD" columns={['Fecha','Entradas','Salidas','Saldo']} rows={result.daily.map(row => [row.date,money(row.income),money(row.expenses),money(row.balance)])}/></details></Card></>}
    <Card><Title help="Las estimaciones se calculan con registros históricos.">Origen del pronóstico</Title>
      <div className="stat-row"><span>Compromisos registrados</span><strong>{data.knownCount}</strong></div><div className="stat-row"><span>Estimaciones históricas</span><strong>{data.estimatedCount}</strong></div>
      <details><summary>Ver desglose ({data.events.length})</summary><Table caption="Origen de las proyecciones" columns={['Fecha','Concepto','Origen','Importe']} rows={data.events.map(row => [row.date,row.label,<span>{row.source==='known'?'Registrado':'Estimado'}<Help label={'Evidencia de '+row.label}>{row.id || row.evidence.join(', ')}</Help></span>,money(row.amount)])}/></details>
    </Card>
    <Card><Title help="Se entrena con los dos primeros meses y se evalúa contra el tercero sin incluirlo en el entrenamiento. Es una ventana del historial disponible, no una garantía de precisión futura.">Evaluación del modelo</Title>
      {data.backtest ? <><p className="period">Mes evaluado: {data.backtest.holdout}</p><div className="metrics two">
        <Metric label="Error medio del modelo" value={money(data.backtest.cumulativeMAE)} help="Diferencia absoluta media entre flujo acumulado diario observado y proyectado, partiendo de cero."/>
        <Metric label="Error de referencia" value={money(data.backtest.baselineMAE)} help="Error al repetir el último mes de entrenamiento. Permite contrastar el modelo con una alternativa sencilla."/>
      </div><p>{data.backtest.cumulativeMAE <= data.backtest.baselineMAE ? 'El modelo iguala o mejora la referencia en este mes.' : 'El modelo no supera la referencia en este mes.'}</p></> : <p>Sin historial suficiente para evaluar.</p>}
    </Card></>;
}

function ForecastChart({ daily, opening }) {
  const values = [opening,...daily.map(row => row.balance)], low = Math.min(0,...values), high = Math.max(1,...values);
  const y = value => 170-(value-low)/(high-low)*140;
  const points = values.map((value,i) => (20+i/(values.length-1)*640)+','+y(value)).join(' ');
  return <svg className="forecast-chart" viewBox="0 0 680 200" role="img" aria-label={'Saldo inicial '+money(opening)+', saldo final proyectado '+money(values.at(-1))+'. Los valores diarios están en el calendario.'}>
    <line x1="20" x2="660" y1={y(0)} y2={y(0)} className="zero-line" strokeDasharray="5 5"/><polyline points={points} fill="none" className="chart-line" strokeWidth="3"/>
    <text x="20" y="196">Hoy</text><text x="540" y="196">Día 30</text>
  </svg>;
}

export function AlertsView({ pendingCount, forecast, onForecast }) {
  const base = forecast?.scenarios?.base;
  return <><Title>Alertas de liquidez</Title><Card><span className="badge">{pendingCount} {pendingCount === 1 ? 'movimiento pendiente' : 'movimientos pendientes'}</span>
    <h3>{base ? base.firstDeficit ? 'Posible déficit el '+base.firstDeficit : 'Sin déficit calculado' : 'Sin proyección disponible'}</h3>
    {base && <p>Déficit a cubrir: {money(base.buffer)}</p>}
    <button className="secondary" onClick={onForecast}>Revisar pronóstico</button>
  </Card></>;
}

export function SettingsView() {
  return <><Title>Ajustes</Title><AccessibilitySettings/></>;
}

export function HealthView({ insights: data, accountId, busy, onSaveGoal }) {
  if (!data) return <Card><h2>Salud financiera</h2><p>Selecciona una cuenta para ver el análisis.</p></Card>;
  const balance = data.forecast?.balance;
  const progress = balance != null && data.goal.target > 0 ? Math.min(100,Math.max(0,balance)/data.goal.target*100) : 0;
  return <><Title help="Indicadores calculados con el historial de la cuenta. No son un puntaje crediticio.">Salud financiera</Title>
    {!data.enoughHistory && <p className="notice warning">Historial insuficiente para comparar tres meses.</p>}
    {data.invalidCount > 0 && <p role="alert" className="notice warning">{data.invalidCount} registros excluidos por fecha o monto inválido.</p>}
    <div className="metrics">
      <Metric label="Ingreso mensual medio" value={data.enoughHistory ? money(data.averageIncome) : 'Sin datos'}/>
      <Metric label="Gasto mensual medio" value={data.enoughHistory ? money(data.averageExpenses) : 'Sin datos'}/>
      <Metric label="Variación de ingresos" value={data.variation == null ? 'Sin datos' : data.variation+'%'} help="Diferencia entre el mayor y menor ingreso mensual, dividida por el promedio. Se usan tres meses cerrados."/>
      <Metric label="Aumentos recurrentes" value={data.recurring.filter(row=>row.increased).length} help="Últimos cargos recurrentes que superan en más del 20% la mediana de los dos anteriores."/>
    </div>
    <div className="overview-grid"><Card><Title help="La meta se guarda en BusyNessy. Comparamos el saldo reportado de tu cuenta contra la meta; no apartamos dinero ni usamos un saldo de ahorro ingresado manualmente.">Meta de reserva</Title>
      <p className="large-value">{money(data.goal.target)}</p><progress value={progress} max="100" aria-label="Saldo actual respecto a la meta"/><p>{Math.round(progress)}% cubierto por el saldo actual</p>
      <form key={accountId+':'+(data.goal.updatedAt||'')} onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await onSaveGoal({target:Number(form.get('target')),saved:0}); } catch {} }}>
        <Field label="Objetivo de reserva (USD)"><input name="target" type="number" min="0" max="1000000000000" step="0.01" defaultValue={data.goal.target} required disabled={busy}/></Field><button disabled={busy}>Guardar meta</button>
      </form></Card>
      <Card><Title help="Las transferencias automáticas de ahorro no están integradas. Esta acción permanece deshabilitada y no modifica tu cuenta.">Ahorro automático</Title>
        <span className="badge">No disponible</span><button disabled className="unavailable">Activar ahorro automático</button></Card></div>
    <Card><Title help="Un cargo por mes durante tres meses consecutivos en fechas próximas. Revisa los contratos antes de interpretar un cargo como innecesario.">Pagos recurrentes</Title>
      {data.recurring.length ? <Table caption="Pagos recurrentes" columns={['Concepto','Última fecha','Variación','Importe']} rows={data.recurring.map(row => [row.label,row.lastDate,row.increased ? <span className="badge warning">+{row.increasePercent}%</span> : row.increasePercent+'%',money(row.amount)])}/> : <p>No se detectó un patrón mensual suficiente.</p>}
    </Card>
    <Card><Title help="Meses calendario anteriores. Solo movimientos completados; no se mezcla el mes actual incompleto.">Historial mensual</Title><Table caption="Ingresos y gastos mensuales" columns={['Mes','Ingresos','Gastos','Flujo neto']} rows={data.months.map(row=>[row.month,money(row.income),money(row.expenses),money(row.net)])}/></Card>
  </>;
}

export function SecurityView({ insights: data, busy, onReview }) {
  const [filter,setFilter] = useState('open');
  if (!data) return <Card><h2>Seguridad de la cuenta</h2><p>Selecciona una cuenta para revisar sus alertas.</p></Card>;
  const labels = {new:'Nueva',review:'En revisión',recognized:'Reconocida'};
  const severity = {high:'Alta',medium:'Media',low:'Baja'};
  const filtered = data.alerts.filter(row => filter==='all' || (filter==='recognized' ? row.status==='recognized' : row.status!=='recognized'));
  return <><Title help="Reglas sobre posibles duplicados, gastos atípicos y comercios nuevos. Una anomalía no confirma fraude. No se bloquean operaciones. El análisis se actualiza con cada consulta y puede generar falsos positivos.">Seguridad de la cuenta</Title>
    <div className="metrics two"><Metric label="Por revisar" value={data.openAlerts}/><Metric label="Reconocidas" value={data.alerts.filter(row=>row.status==='recognized').length}/></div>
    <div className="segmented" aria-label="Filtrar alertas">{[['open','Por revisar'],['recognized','Reconocidas'],['all','Todas']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    {!filtered.length && <Card><p>No hay alertas en esta vista.</p></Card>}
    {filtered.map(alert=><Card key={alert.id}><div className="section-heading"><h3>{alert.title}</h3><span className="badge warning">Prioridad {severity[alert.severity]}</span></div>
      <span className={'badge '+(alert.status==='recognized'?'completed':'')}>{labels[alert.status]}</span><p>{alert.reason}</p>
      <details><summary>Movimientos relacionados ({alert.evidence.length})</summary><Table caption="Evidencia de la alerta" columns={['Concepto','Fecha','Monto']} rows={alert.evidence.map(row=>[<span>{row.description}<Help label={'Referencia de '+row.description}>{row.id}</Help></span>,row.date,money(row.amount)])}/></details>
      <div className="button-row"><button aria-label={'Reconocer: '+alert.title} disabled={busy||alert.status==='recognized'} onClick={async()=>{try{await onReview(alert.id,'recognized');}catch{}}}>Reconocer</button><button className="secondary" aria-label={'Revisar: '+alert.title} disabled={busy||alert.status==='review'} onClick={async()=>{try{await onReview(alert.id,'review');}catch{}}}>Marcar para revisar</button>
        {alert.status!=='new' && <button className="secondary" disabled={busy} onClick={async()=>{try{await onReview(alert.id,'new');}catch{}}}>Restablecer</button>}</div>
      {alert.reviewedAt && <small>Revisión: {new Date(alert.reviewedAt).toLocaleString('es-MX')}</small>}
    </Card>)}
  </>;
}
