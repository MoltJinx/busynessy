import React from 'react';

// Los identificadores no dependen del texto visible: cambiar una etiqueta
// o traducirla no altera la navegación.
export const DASHBOARD_SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: '◫' },
  { id: 'movements', label: 'Movimientos', icon: '↕️' },
  { id: 'expenses', label: 'Gastos', icon: '↗️' },
  { id: 'forecast', label: 'Pronóstico', icon: '⌁' },
  { id: 'alerts', label: 'Alertas', icon: '○' },
];

export default function Sidebar({ activeSection, onNavigate, onConsole, onLogout }) {
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
        <button onClick={onConsole}>Abrir consola ↗️</button>
        <button onClick={onLogout}>Cerrar sesión</button>
      </div>
    </aside>
  );
}