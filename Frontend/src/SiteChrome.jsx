import React, { useEffect, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';

export const assetUrl = name => `${import.meta.env.BASE_URL}${name}`;

export function SiteHeader({ menuOpen, onMenu, onSearch, onHome, email }) {
  const header = useRef(null);
  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--header-h', `${header.current.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header.current); measure();
    return () => observer.disconnect();
  }, []);
  return <header ref={header} className="bank-header">
    <div className="institution-bar"><div><span>BusyNessy · Finanzas empresariales</span><span className="institution-detail">Tu negocio, en perspectiva</span></div></div>
    <div className="bank-nav">
      <button className="bank-home" aria-label="BusyNessy, ir al resumen" onClick={onHome}><img src={assetUrl('brand-header.png')} alt="BusyNessy" width="170" height="96"/></button>
      <div className="bank-actions">
        {email && <span className="header-email">{email}</span>}
        {onSearch && <button className="bank-icon search-action" onClick={onSearch} aria-label="Buscar movimientos"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg></button>}
        <div className="bank-profile"><UserButton/></div>
        {onMenu && <button className="bank-icon bank-menu" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-controls="financial-navigation" aria-expanded={menuOpen} onClick={onMenu}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={menuOpen ? 'm5 5 14 14M19 5 5 19' : 'M4 6h16M4 12h16M4 18h16'}/></svg></button>}
      </div>
    </div>
  </header>;
}

export function SiteFooter() {
  const [topic, setTopic] = useState(null);
  const dialog = useRef(null);
  useEffect(() => { if (topic) dialog.current?.showModal(); }, [topic]);
  return <>
    <footer className="bank-footer"><div className="footer-inner">
      <div><img src={assetUrl('brand-header.png')} alt="BusyNessy" width="150" height="85"/><p>Claridad para cada decisión de tu empresa.</p></div>
      <nav aria-label="Información institucional">
        <button onClick={() => setTopic('Ayuda')}>Ayuda</button>
        <button disabled title="Términos aún no publicados">Términos</button>
        <button disabled title="Canal de contacto aún no configurado">Contacto</button>
        <button onClick={() => setTopic('Acerca de BusyNessy')}>Acerca de</button>
      </nav>
      <small>BusyNessy · Finanzas empresariales</small>
    </div></footer>
    {topic && <dialog ref={dialog} aria-labelledby="footer-topic" onClose={() => setTopic(null)}>
      <h2 id="footer-topic">{topic}</h2>
      {topic === 'Ayuda' ? <><p>Selecciona tu cuenta para consultar saldo, movimientos y pronóstico. El menú reúne las herramientas de tu empresa.</p><p>Para consultar de nuevo, jala hacia abajo desde el inicio de la página o desplaza la rueda hacia arriba. Con teclado, usa Alt + R.</p><p>Los iconos de interrogación explican cada indicador. En Ajustes puedes activar texto grande y alto contraste.</p></> : <p>BusyNessy reúne las cuentas, movimientos y análisis de tu empresa para ayudarte a entender tus ingresos, gastos y necesidades de liquidez.</p>}
      <button onClick={() => dialog.current.close()}>Cerrar</button>
    </dialog>}
  </>;
}

export function RefreshToast({ error, message }) {
  return <div className={`refresh-toast${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{error || message}</div>;
}
