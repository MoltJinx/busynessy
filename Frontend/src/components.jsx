import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { money, types, statuses } from './data.js';

export function Card({ children, className = '' }) { return <section className={`card ${className}`}>{children}</section>; }
export function Help({ label, children }) {
  const id = useId(), trigger = useRef(null), panel = useRef(null), timer = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({});
  const show = () => {
    clearTimeout(timer.current);
    const box = trigger.current.getBoundingClientRect(), width = Math.min(320, window.innerWidth - 32);
    const below = box.bottom + 220 < window.innerHeight;
    setPosition({ width, maxHeight: Math.max(80, (below ? window.innerHeight - box.bottom : box.top) - 20), left: Math.max(16, Math.min(box.left, window.innerWidth - width - 16)), ...(below ? { top: box.bottom + 4 } : { bottom: window.innerHeight - box.top + 4 }) });
    setOpen(true);
  };
  const hideLater = () => { timer.current = setTimeout(() => setOpen(false), 180); };
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (event.key === 'Escape' || (event.type === 'pointerdown' && !trigger.current?.contains(event.target) && !panel.current?.contains(event.target))) setOpen(false); };
    const close = event => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', dismiss); document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); clearTimeout(timer.current); };
  }, [open]);
  return <span className="help-wrap"><button ref={trigger} type="button" className="help-button" aria-label={`Ayuda: ${label}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined}
    onMouseEnter={show} onMouseLeave={hideLater} onFocus={show} onBlur={hideLater} onClick={show}><span aria-hidden="true">?</span></button>
    {open && createPortal(<div ref={panel} id={id} role="tooltip" className="help-popover" style={position} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hideLater}>{children}</div>, document.body)}</span>;
}
export function Field({ label, help, children }) {
  const id = useId();
  return <div className="field"><div className="field-label"><label htmlFor={id}>{label}</label>{help && <Help label={label}>{help}</Help>}</div>{React.cloneElement(children, { id })}</div>;
}
export function Title({ children, help, level = 2 }) {
  const Heading = `h${level}`;
  return <div className="title-row"><Heading>{children}</Heading>{help && <Help label={typeof children === 'string' ? children : 'Información'}>{help}</Help>}</div>;
}
export function Metric({ label, value, help, primary = false }) {
  return <Card className={primary ? 'metric-card primary' : 'metric-card'}><div className="metric-label">{label}{help && <Help label={label}>{help}</Help>}</div><strong className="metric">{value}</strong></Card>;
}
export function Table({ columns, rows, caption }) {
  return <table className="data-table" role="table"><caption className="sr-only">{caption}</caption><thead role="rowgroup"><tr role="row">{columns.map(c => <th role="columnheader" scope="col" key={c}>{c}</th>)}</tr></thead><tbody role="rowgroup">{rows.map((cells, i) => <tr role="row" key={i}>{cells.map((cell, j) => <td role="cell" key={j} data-label={columns[j]}>{cell}</td>)}</tr>)}</tbody></table>;
}
export function MovementTable({ movements }) {
  if (!movements.length) return <div className="empty"><Icon name="movements"/><h3>Sin movimientos</h3><p>Esta cuenta aún no tiene operaciones registradas.</p></div>;
  return <Table caption="Movimientos de la cuenta seleccionada" columns={['Concepto','Fecha','Estado','Monto USD']} rows={movements.map(m => [
    <div><strong>{m.description}</strong><div className="inline-meta">{types[m.type]}<Help label={`Referencia de ${m.description}`}>ID: {m.id}</Help></div></div>, m.date,
    <span className={`badge ${m.status}`}>{statuses[m.status] || m.status}</span>, <strong className={m.type === 'deposit' ? 'amount positive' : 'amount'}>{m.type === 'deposit' ? '+' : '−'}{money(m.amount)}</strong>,
  ])}/>;
}
export function AddressFields({ disabled, optional = false }) {
  return <div className="form-grid">
    <Field label="Número exterior"><input name="street_number" required={!optional} maxLength="100" autoComplete="off" disabled={disabled}/></Field>
    <Field label="Calle"><input name="street_name" required={!optional} maxLength="100" autoComplete="address-line1" disabled={disabled}/></Field>
    <Field label="Ciudad"><input name="city" required={!optional} maxLength="100" autoComplete="address-level2" disabled={disabled}/></Field>
    <Field label="Entidad federativa" help="Por ejemplo: CDMX, Jalisco o Nuevo León."><input name="state" required={!optional} pattern="[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ ]{2,30}" maxLength="30" autoComplete="address-level1" disabled={disabled}/></Field>
    <Field label="Código postal"><input name="zip" required={!optional} pattern="[0-9]{5}" maxLength="5" inputMode="numeric" autoComplete="postal-code" disabled={disabled}/></Field>
  </div>;
}
export const readAddress = form => Object.fromEntries(['street_number','street_name','city','state','zip'].map(key => [key, form.get(key)]));
export function ConfirmDialog({ title, children, onCancel, onConfirm, busy, destructive = false }) {
  const ref = useRef(), origin = useRef(typeof document === 'undefined' ? null : document.activeElement), heading = useId(), body = useId();
  useEffect(() => {
    const dialog = ref.current; dialog.showModal();
    return () => { dialog.close(); queueMicrotask(() => { if (origin.current?.isConnected) origin.current.focus(); }); };
  }, []);
  const keepFocus = event => {
    if (event.key !== 'Tab') return;
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <dialog ref={ref} aria-labelledby={heading} aria-describedby={body} onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}><h2 id={heading}>{title}</h2><div id={body}>{children}</div><div className="button-row">
    <button type="button" autoFocus className="secondary" onClick={onCancel} disabled={busy}>Cancelar</button><button type="button" className={destructive ? 'danger' : ''} onClick={onConfirm} disabled={busy}>{busy ? 'Procesando…' : 'Confirmar'}</button></div></dialog>;
}
export function AccessibilitySettings() {
  const preference = key => typeof localStorage !== 'undefined' && localStorage.getItem(key) === 'true';
  const [large, setLarge] = useState(() => preference('busynessy-large-text'));
  const [contrast, setContrast] = useState(() => preference('busynessy-contrast'));
  useEffect(() => { document.documentElement.dataset.largeText = String(large); localStorage.setItem('busynessy-large-text', large); }, [large]);
  useEffect(() => { document.documentElement.dataset.contrast = String(contrast); localStorage.setItem('busynessy-contrast', contrast); }, [contrast]);
  const Toggle = ({ label, help, checked, onChange }) => <div className="setting-row"><div className="setting-label">{label}<Help label={label}>{help}</Help></div><button type="button" className="setting-switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span aria-hidden="true" className="switch-track"><span/></span><span>{checked ? 'Activado' : 'Desactivado'}</span></button></div>;
  return <Card className="accessibility-card"><Title help="Estas preferencias se guardan solo en este navegador.">Accesibilidad</Title>
    <Toggle label="Texto grande" help="Aumenta el tamaño del texto sin cambiar la información mostrada." checked={large} onChange={setLarge}/>
    <Toggle label="Alto contraste" help="Refuerza la diferencia entre fondos, texto y controles." checked={contrast} onChange={setContrast}/>
  </Card>;
}
export function Icon({ name }) {
  const paths = { summary:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', movements:'M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4', expenses:'M4 4h16v16H4z M8 9h8M8 14h5', forecast:'M3 3v18h18M6 15l4-5 4 3 6-8', health:'M4 12h4l3-7 4 14 3-7h3', security:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6', alerts:'M12 3 2 21h20z M12 9v5m0 3v1', settings:'M12 2.5l1.5 3.4 3.7.4-2.8 2.5.8 3.7-3.2-1.8-3.2 1.8.8-3.7-2.8-2.5 3.7-.4L12 2.5zm0 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' };
  return <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.summary}/></svg>;
}
