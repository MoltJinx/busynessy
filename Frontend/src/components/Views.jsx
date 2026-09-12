import React from 'react';
import { Card, MovementTable } from './componentes.jsx';
import { money } from './data.js';

// Estas vistas solo presentan datos recibidos por props. No consultan APIs
// ni mantienen una copia de los movimientos que administra App.
export function SummaryView({ summary, movements, onShowMovements }) {
  const metrics = [
    { label: 'Flujo neto registrado', value: summary.net, highlighted: true },
    { label: 'Ingresos', value: summary.income },
    { label: 'Gastos', value: summary.expenses },
    { label: 'Escenario a 30 días', value: summary.projected },
  ];

  // Las barras comparten escala. El mínimo de 1 evita un máximo de cero
  // cuando una empresa todavía no tiene operaciones completadas.
  const flowMaximum = Math.max(summary.income, summary.expenses, 1);
  const flows = [
    { label: 'Ingresos', value: summary.income },
    { label: 'Gastos', value: summary.expenses },
  ];

  return (
    <>
      <div className="metrics">
        {metrics.map(({ label, value, highlighted }) => (
          <Card key={label} className={highlighted ? 'hero' : ''}>
            <p>{label}</p>
            <strong className="metric">{money(value)}</strong>
            <small>USD · Datos de ejemplo</small>
          </Card>
        ))}
      </div>

      <Card>
        <h2>Tu panorama financiero</h2>
        <p>
          {movements.length} movimientos de demostración. El flujo neto incluye
          solamente operaciones completadas y no representa un saldo bancario.
        </p>
        <div className="flow-bars">
          {flows.map(({ label, value }) => (
            <div key={label}>
              <span>{label}</span>
              <progress aria-label={label} value={value} max={flowMaximum} />
              <b>{money(value)}</b>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="section-heading">
          <h2>Últimos movimientos</h2>
          <button className="subtle" onClick={onShowMovements}>Ver todos →</button>
        </div>
        {/* Se conserva el orden recibido; la consola agrega ejemplos al inicio. */}
        <MovementTable movements={movements.slice(0, 4)} />
      </Card>
    </>
  );
}

export function MovementsView({ movements, searchQuery, onSearchChange }) {
  return (
    <>
      <h2>Todos los movimientos</h2>
      <p>Datos visuales compartidos con la consola en esta pestaña. Sin conexión bancaria.</p>
      <input
        className="search"
        aria-label="Buscar movimiento"
        placeholder="Buscar movimiento…"
        value={searchQuery}
        onChange={event => onSearchChange(event.target.value)}
      />
      <Card><MovementTable movements={movements} /></Card>
    </>
  );
}

export function ExpensesView({ completedExpenses, movements }) {
  return (
    <>
      <h2>Análisis de gastos</h2>
      <Card>
        <p>Gastos completados</p>
        <strong className="metric">{money(completedExpenses)}</strong>
        <p>Los pendientes aparecen en el historial, pero no se suman al total.</p>
        <MovementTable movements={movements} />
      </Card>
    </>
  );
}

export function ForecastView({ projected, reserve }) {
  return (
    <>
      <h2>Pronóstico de 30 días</h2>
      <Card className="hero">
        <p>Escenario ilustrativo</p>
        <strong className="metric">{money(projected)}</strong>
        <p>Flujo neto menos una reserva del 15% de los gastos completados.</p>
      </Card>
      <Card>
        <h2>Planea antes de pagar</h2>
        <p>
          Este diseño no incluye un motor predictivo. Las cifras son una
          simulación local para explorar la interfaz.
        </p>
        <p>Reserva ilustrativa: <b>{money(reserve)}</b></p>
      </Card>
    </>
  );
}

export function AlertsView({ netFlow, pendingCount }) {
  const title = netFlow < 0
    ? 'Las salidas superan a las entradas'
    : 'Anticípate a tus próximos pagos';

  return (
    <>
      <h2>Alertas de tu empresa</h2>
      <Card>
        <span className="badge pending">Revisión de liquidez</span>
        <h3>{title}</h3>
        <p>
          {pendingCount} movimientos pendientes de demostración.
          Revisa tus compromisos antes de usar tu reserva.
        </p>
      </Card>
    </>
  );
}