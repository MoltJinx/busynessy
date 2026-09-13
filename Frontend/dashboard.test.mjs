import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildForecast } from '../backend/forecast.mjs';

const server = await createServer({server:{middlewareMode:true}});
try {
  const {default:Dashboard,...views} = await server.ssrLoadModule('/src/Dashboard.jsx');
  const {default:Console} = await server.ssrLoadModule('/src/Console.jsx');
  const {normalizeMovements} = await server.ssrLoadModule('/src/api.js');
  const {totals,money} = await server.ssrLoadModule('/src/data.js');
  const {Help} = await server.ssrLoadModule('/src/components.jsx');
  const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
  const raw={deposits:[{_id:'d',amount:6200,transaction_date:'2026-09-12',status:'completed',description:'Cobro'}],withdrawals:[{_id:'w',amount:500,transaction_date:'2026-09-11',status:'completed',description:'Nómina'}],purchases:[],bills:[{_id:'b',payment_amount:100,payment_date:'2026-09-20',status:'pending',nickname:'Servicio'}]};
  const movements=normalizeMovements(raw,'account');
  assert.equal(movements.length,3); assert.equal(totals(movements).expenses,500);
  assert.throws(()=>normalizeMovements({...raw,deposits:[{_id:'invalid',amount:'no',transaction_date:'2026-09-12'}]},'a'),/inválidos/);
  assert.throws(()=>normalizeMovements({...raw,bills:null},'a'),/incompleto/);
  const panel=render(Dashboard,{company:{name:'Empresa QA'},movements,onLogout(){},onConsole(){}});
  assert(panel.includes('Empresa QA')); assert(panel.includes(money(5700))); assert(panel.includes('aria-current="page"'));
  const help=render(Help,{label:'Saldo',children:'Información contextual'});
  assert(help.includes('aria-label="Ayuda: Saldo"')); assert(help.includes('aria-expanded="false"')); assert(!help.includes('Información contextual'));
  const empty=render(views.MovementsView,{movements:[],searchQuery:'',onSearchChange(){}});
  assert(empty.includes('Sin movimientos'));
  const expenses=render(views.ExpensesView,{movements:movements.filter(r=>r.type!=='deposit'),completedExpenses:500});
  assert(expenses.includes('100.0%')); assert(expenses.includes('data-label="Concepto"'));
  const forecast=render(views.ForecastView,{forecast:buildForecast([],0,new Date('2026-09-12'))});
  assert(forecast.includes('Historial insuficiente')); assert(forecast.includes('Calendario de 30 días')); assert(!forecast.includes('Prudente')); assert(!forecast.includes('hipotético'));
  const insights={goal:{target:5000,saved:9999},forecast:{balance:1000},recurring:[],enoughHistory:false,invalidCount:0,averageIncome:0,averageExpenses:0,variation:null,months:[],alerts:[],openAlerts:0};
  const health=render(views.HealthView,{insights,accountId:'a',onSaveGoal(){}});
  assert(health.includes('value="20"')); assert(health.includes('disabled="" class="unavailable"')); assert(!health.includes('9,999'));
  const security=render(views.SecurityView,{insights:{...insights,alerts:[{id:'x',title:'Cargo atípico',reason:'Importe superior al historial',status:'new',severity:'high',evidence:[]}]},onReview(){}});
  assert(security.includes('Reconocer: Cargo atípico'));
  const settings=render(views.SettingsView,{});
  assert(settings.includes('Accesibilidad')); assert.equal((settings.match(/role="switch"/g)||[]).length,2);
  const consoleView=render(Console,{selectors:null,companyId:'c',accountId:'a',accounts:[],movements:[],merchants:[],ready:true,mutate(){},onApp(){},onLogout(){}});
  assert(consoleView.includes('Revisar operación')); assert(consoleView.includes('Latitud')); assert(!consoleView.includes('value="250"')); assert(!consoleView.includes('Prueba Busynessy'));
  const adminConsole=render(Console,{adminMode:true,selectors:null,companyId:'',accountId:'',accounts:[],movements:[],merchants:[],ready:false,mutate(){},onApp(){},onLogout(){}});
  assert(adminConsole.includes('Consola de administración')); assert(adminConsole.includes('Registrar movimiento')); assert(!adminConsole.includes('Abrir aplicación'));
  const forbiddenCopy = /nessie|sandbox|modo\s+(?:de\s+)?pruebas?|test[\s_-]*mode|demo[\s_-]*mode/i;
  for (const markup of [panel,consoleView,forecast,health,security,expenses,empty]) assert.doesNotMatch(markup,forbiddenCopy);
  // Incluye ayudas cerradas, atributos accesibles y metadatos que SSR no expande.
  for (const file of ['src/Console.jsx','src/Dashboard.jsx','src/components.jsx','src/main.jsx','index.html','favicon.svg']) assert.doesNotMatch(readFileSync(file,'utf8'),forbiddenCopy,file);
  const backend=readFileSync('../backend/server.mjs','utf8');
  assert(!backend.includes('seedAccountHistory')); assert(!backend.includes('Main Street')); assert(!backend.includes('createDemoAccount'));
  assert(!backend.includes('catch { return {ok:true}')); assert(backend.includes('customerPayload(b)')); assert(backend.includes('provisionAccount(nessie'));
  const luminance = color => {
    const values = color.slice(1).match(/../g).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return values[0]*.2126+values[1]*.7152+values[2]*.0722;
  };
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const palette = [['#101418','#ffffff'],['#45545c','#f3f6f7'],['#006080','#ffffff'],['#006080','#e9f7fd'],['#101418','#7bd6f4'],['#203d19','#c9efbc'],['#554300','#f4f1dd'],['#9a2525','#ffffff'],['#265623','#ffffff']];
  const css=readFileSync('src/styles.css','utf8');
  const main=readFileSync('src/main.jsx','utf8');
  const app=readFileSync('src/App.jsx','utf8');
  assert(!main.includes('AccessibilityTools')); assert(!main.includes('utility-bar'));
  assert(!app.includes('AccessibilitySettings'));
  assert(app.includes("submittedUsername === 'admin' && password === 'password'"));
  assert(app.includes("request('auth/admin/login'"));
  assert(!app.includes("if (page === 'console') return"));
  assert(!readFileSync('src/Dashboard.jsx','utf8').includes('onConsole'));
  assert(css.includes('.setting-switch[aria-checked="true"]'));
  for(const [foreground,background] of palette) {
    assert(css.includes(foreground)); assert(contrast(foreground,background)>=4.5,`${foreground} / ${background} debe cumplir AA`);
  }
  assert(contrast('#778b96','#ffffff')>=3,'Bordes de campos con contraste no textual');
  console.log('PASS: render, tablas responsive, ayudas, métricas, estados vacíos, alta vía backend y contraste AA de la paleta.');
} finally { await server.close(); }
