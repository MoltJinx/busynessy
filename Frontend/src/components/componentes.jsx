import React from 'react';
import { money, types, statuses } from './data.js';

export function Card({ children, className = '' }) { return <section className={`card ${className}`}>{children}</section>; }
export function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function MovementTable({ movements }) {
  return <div className="table-scroll"><table><thead><tr><th>Movimiento</th><th>Fecha</th><th>Estado</th><th>Monto USD</th></tr></thead><tbody>{movements.map(m => <tr key={m.id}><td><strong>{m.description}</strong><small>{types[m.type]} · {m.id}</small></td><td>{m.date}</td><td><span className={`badge ${m.status}`}>{statuses[m.status]}</span></td><td className={m.type === 'deposit' ? 'positive amount' : 'amount'}>{m.type === 'deposit' ? '+' : '−'}{money(m.amount)}</td></tr>)}</tbody></table>{!movements.length && <p className="empty">Todavía no hay movimientos en esta cuenta.</p>}</div>;
}
