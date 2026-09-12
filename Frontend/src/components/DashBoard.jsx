import React, { useState } from 'react';
import { totals } from './data.js';
import Sidebar from './Sidebar.jsx';
import {
  SummaryView,
  MovementsView,
  ExpensesView,
  ForecastView,
  AlertsView,
} from './Views.jsx';

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