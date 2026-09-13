import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { esES } from '@clerk/localizations';
import App from './App.jsx';
import './styles.css';

const accountAppearance = {
  variables: { colorPrimary: '#28758b', colorText: '#101010', borderRadius: '10px' },
  elements: { footerItem: { display: 'none' }, navbarButton: 'account-nav-button' },
};
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw Error('Falta la configuración de acceso.');

createRoot(document.getElementById('root')).render(<React.StrictMode><ClerkProvider publishableKey={publishableKey} localization={esES} appearance={accountAppearance}><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Saltar al contenido</a><App/></ClerkProvider></React.StrictMode>);
