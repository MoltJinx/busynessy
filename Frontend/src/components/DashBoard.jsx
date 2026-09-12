import React, { useState } from 'react';
import { money, totals, types, statuses } from './data.js';

/**
 * Contenedor del panel financiero (solo frontend de demostración).
 *
 * App entrega la empresa y sus movimientos mediante props. Este componente
 * conserva únicamente el estado visual: sección activa y búsqueda.
 * onLogout y onConsole permiten navegar sin acoplar el panel a App.
 */
export default function Dashboard({ company, movements, onLogout, onConsole }) {
  const [activeSection, setActiveSection] = useState('summary');
  const [searchQuery, setSearchQuery] = useState('');

  // Son datos derivados, no otro estado: al cambiar los movimientos desde la
  // consola, React vuelve a calcular los totales sin sincronizaciones manuales.
  const summary = totals(movements);
  const expenseMovements = movements.filter(movement => movement.type !== 'deposit');
  const pendingCount = movements.filter(movement => movement.status === 'pending').length;
  const normalizedQuery = searchQuery.toLocaleLowerCase();
  const filteredMovements = movements.filter(movement =>
    movement.description.toLocaleLowerCase().includes(normalizedQuery)
  );

  // La reserva sigue siendo una regla ilustrativa, no una predicción bancaria.
  const reserve = summary.expenses * 0.15;

  function renderActiveSection() {
    switch (activeSection) {
      case 'movements':
        return (
          <MovementsView
            movements={filteredMovements}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'expenses':
        return (
          <ExpensesView
            completedExpenses={summary.expenses}
            movements={expenseMovements}
          />
        );
      case 'forecast':
        return <ForecastView projected={summary.projected} reserve={reserve} />;
      case 'alerts':
        return <AlertsView netFlow={summary.net} pendingCount={pendingCount} />;
      default:
        return (
          <SummaryView
            summary={summary}
            movements={movements}
            onShowMovements={() => setActiveSection('movements')}
          />
        );
    }
  }

  return (
    <div className="shell">
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        onConsole={onConsole}
        onLogout={onLogout}
      />

      <main>
        <header>
          <div>
            <p className="eyebrow">CUENTA EMPRESARIAL</p>
            <h1>{company.name}</h1>
          </div>
          <span className="badge">Vista de demostración</span>
        </header>

        {renderActiveSection()}

        <footer>Solo frontend · Sin Nessie, credenciales ni base de datos.</footer>
      </main>
    </div>
  );
}

// ── Menú lateral ──────────────────────────────────────────────────────

// Los identificadores no dependen del texto visible: cambiar una etiqueta
// o traducirla no altera la navegación.
const DASHBOARD_SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: '◫' },
  { id: 'movements', label: 'Movimientos', icon: '↕' },
  { id: 'expenses', label: 'Gastos', icon: '↗' },
  { id: 'forecast', label: 'Pronóstico', icon: '⌁' },
  { id: 'alerts', label: 'Alertas', icon: '○' },
];

function Sidebar({ activeSection, onNavigate, onConsole, onLogout }) {
  return (
    <aside>
      <div className="brand">
        BUSYNESSY
        <span>Tu empresa, en equilibrio.</span>
      </div>

      <nav aria-label="Panel financiero">
        {DASHBOARD_SECTIONS.map(({ id, label, icon }) => (
          <button
            key={id}
            className={activeSection === id ? 'selected' : ''}
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="nav-icon" aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* Las acciones se delegan a App; aquí no se modifica la sesión. */}
      <div className="side-bottom">
        {onConsole && <button onClick={onConsole}>Abrir consola ↗</button>}
        {onLogout && <button onClick={onLogout}>Cerrar sesión</button>}
      </div>
    </aside>
  );
}

// ── Secciones del panel ───────────────────────────────────────────────
// Se exportan también por nombre para comprobarlas en las pruebas.

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

// ── Elementos visuales reutilizados dentro de este dashboard ──────────
// Permanecen aquí para que no sea necesario copiar un components.jsx aparte.
function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function MovementTable({ movements }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Movimiento</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Monto USD</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(movement => (
            <tr key={movement.id}>
              <td>
                <strong>{movement.description}</strong>
                <small>{types[movement.type]} · {movement.id}</small>
              </td>
              <td>{movement.date}</td>
              <td>
                <span className={`badge ${movement.status}`}>
                  {statuses[movement.status]}
                </span>
              </td>
              <td className={movement.type === 'deposit' ? 'positive amount' : 'amount'}>
                {movement.type === 'deposit' ? '+' : '−'}{money(movement.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!movements.length && (
        <p className="empty">Todavía no hay movimientos en esta cuenta.</p>
      )}
    </div>
  );
}