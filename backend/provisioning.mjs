import { randomInt, randomUUID } from 'node:crypto';
import { apiFault, nessieTrace } from './nessie.mjs';

const text = (value, fallback, label, max = 100) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw apiFault(422,`${label}: valor inválido.`);
  return value.trim();
};

// Solo prepara payloads: nunca se presentan como datos bancarios antes de POST + GET.
export function customerPayload(input) {
  const suffix = randomUUID().slice(0,8);
  const address = input.address || {};
  const result = {
    first_name: text(input.firstName, 'QA '+suffix, 'Nombre'),
    last_name: text(input.lastName, 'Registro '+randomInt(1000,10000), 'Apellidos'),
    address: {
      street_number: text(address.street_number,String(randomInt(1,9999)),'Número'),
      street_name: text(address.street_name,'Avenida Paseo de la Reforma '+suffix,'Calle'),
      city: text(address.city,'Ciudad de México','Ciudad'),
      state: text(address.state,'CDMX','Entidad federativa').toUpperCase(),
      zip: text(address.zip,'06600','Código postal'),
    },
  };
  if (!/^[A-ZÁÉÍÓÚÜÑ ]{2,30}$/.test(result.address.state) || !/^\d{5}$/.test(result.address.zip)) throw apiFault(422,'Entidad federativa: de 2 a 30 letras; código postal: cinco dígitos.');
  return result;
}

const iso = date => date.toISOString().slice(0,10);

// Descripciones legibles para el historial que se crea mediante POST al alta.
export function buildInitialHistory(now = new Date()) {
  const year = now.getUTCFullYear(), latestMonth = now.getUTCMonth(), latestDay = now.getUTCDate();
  const dateAt = (month, day) => {
    const safeMonth = Math.max(0, Math.min(month, latestMonth));
    const monthEnd = new Date(Date.UTC(year, safeMonth + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(year, safeMonth, Math.max(1, Math.min(day, monthEnd, safeMonth === latestMonth ? latestDay : day)))));
  };
  const deposits = [
    ['Grupo Montalvo — FC-1048 — Consultoría de procesos',12800],['Hotel Mirador — FC-1052 — Implementación de sistema',8400],
    ['Talleres del Valle — FC-1061 — Servicio de mantenimiento',11200],['Café Estación — FC-1067 — Renovación de contrato',7600],
    ['Distribuidora Nopal — FC-1074 — Diagnóstico operativo',13100],['Clínica San Jorge — FC-1080 — Capacitación de personal',9200],
    ['Constructora Altura — FC-1088 — Supervisión de obra',11800],['Librería Juárez — FC-1095 — Instalación de punto de venta',6800],
    ['Restaurante Brasa — FC-1104 — Soporte mensual',12500],['Transportes Maya — FC-1111 — Ampliación de servicio',9100],
    ['Fábrica del Centro — FC-1118 — Auditoría de inventario',13600],['Óptica Reforma — FC-1126 — Renovación de plataforma',7900],
    ['Farmacias Horizonte — FC-1134 — Consultoría comercial',12100],['Bodegas Anáhuac — FC-1142 — Configuración logística',9600],
    ['Panadería Laurel — FC-1150 — Mantenimiento mensual',12900],['Textiles del Bajío — FC-1158 — Proyecto de instalación',7300],
    ['Grupo Nativo — FC-1165 — Optimización de operaciones',13400],['Mercado Victoria — FC-1171 — Renovación de contrato',8500],
  ].map(([description,amount], index) => ({ resource:'deposits', amount, description, date:dateAt(Math.floor(index / 2), index % 2 ? 21 : 7) }));
  const alertPatterns = [
    { merchant:'Mr. Apple México', references:['AV031 — Accesorios para equipo','AV114 — MacBook Air para diseño','AV221 — Plan AppleCare empresarial','AV341 — Compra de iPhone 17 Pro Max'], amounts:[1199,1099,1249,4499] },
    { merchant:'Adobe México', references:['AD052 — Licencias Creative Cloud','AD118 — Adobe Stock para campañas','AD208 — Renovación de licencias','AD327 — Paquete anual para diseño'], amounts:[89,99,92,399] },
    { merchant:'Logística Express CDMX', references:['LX109 — Envío consolidado a Guadalajara','LX244 — Flete de inventario a Puebla','LX501 — Envío urgente nacional','LX718 — Transporte especial de equipo'], amounts:[120,145,135,620] },
    { merchant:'Nube Azteca', references:['NA035 — Almacenamiento de respaldos','NA144 — Servidores para operación','NA312 — Monitoreo de infraestructura','NA770 — Ampliación de capacidad'], amounts:[180,210,195,850] },
    { merchant:'Mercado de Abastos', references:['MA019 — Insumos para operación','MA107 — Inventario de temporada','MA119 — Material de empaque','MA488 — Compra extraordinaria de inventario'], amounts:[250,280,245,1300] },
  ];
  const patterned = alertPatterns.flatMap((item, index) => [
    ...[0,1,2].map(month => ({ resource:'withdrawals', amount:item.amounts[month], description:`${item.merchant} — ${item.references[month]}`, date:dateAt(month, 8 + index) })),
    { resource:'withdrawals', amount:item.amounts[3], description:`${item.merchant} — ${item.references[3]}`, date:dateAt(Math.max(3, latestMonth - 1), 18 + index) },
  ]);
  const duplicates = [
    { resource:'withdrawals', amount:149, description:'Figma México — FG220 — Suscripción de equipo', date:dateAt(Math.max(1,latestMonth - 2), 11) },
    { resource:'withdrawals', amount:149, description:'Figma México — FG220 — Suscripción de equipo', date:dateAt(Math.max(1,latestMonth - 2), 11) },
    { resource:'withdrawals', amount:235, description:'Office Depot México — OD651 — Material de oficina', date:dateAt(Math.max(2,latestMonth - 1), 22) },
    { resource:'withdrawals', amount:235, description:'Office Depot México — OD651 — Material de oficina', date:dateAt(Math.max(2,latestMonth - 1), 22) },
  ];
  const operating = [
    ['Telcel Empresas — TE412 — Planes de comunicación',320],['Gasolina Pemex — GP862 — Combustible de operación',410],
    ['Papelería Lumen — PL305 — Suministros de oficina',185],['Imprenta Reforma — IR918 — Materiales corporativos',290],
    ['Café Avellaneda — CA144 — Reunión con clientes',96],['Contabilidad Rivera — CR640 — Honorarios contables',680],
    ['Seguros GNP — SG792 — Cobertura empresarial',540],['Limpieza Integral MX — LI277 — Servicio de oficina',260],
  ].map(([description,amount], index) => ({ resource:'withdrawals', amount, description, date:dateAt(index, 15) }));
  return [...deposits, ...patterned, ...duplicates, ...operating].sort((a,b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description) || a.amount - b.amount);
}

export async function provisionAccount(nessie, customerId, { nickname, type = 'Checking' }, linkAccount = () => {}) {
  if (!['Checking','Savings'].includes(type)) throw apiFault(422,'Selecciona una cuenta Checking o Savings.');
  const balance = randomInt(5000,15001);
  const result = await nessie(`/customers/${customerId}/accounts`, { method:'POST', body:JSON.stringify({type,nickname,rewards:0,balance}) });
  const accountId = result.objectCreated?._id;
  if (!accountId) throw apiFault(502,'No se recibió el ID de la cuenta. No repitas el alta sin revisar las cuentas existentes.');
  linkAccount(accountId);
  const createdMovementIds = [];
  const verification = { requestId:nessieTrace.getStore()?.requestId, customerId, accountId, createdMovementIds, status:'partial' };
  try {
    const opening = await nessie(`/accounts/${accountId}`);
    if (opening._id !== accountId || opening.customer_id !== customerId || opening.balance !== balance) throw apiFault(502,'No se pudo verificar la cuenta y el saldo inicial.');
    verification.openingBalance = opening.balance;
    const plan = buildInitialHistory();
    if (plan.length < 50) throw apiFault(500,'El historial inicial no cumple el mínimo de movimientos.');
    for (const row of plan) {
      const body = { medium:'balance',status:'completed',transaction_date:row.date,amount:row.amount,description:row.description };
      const posted = await nessie(`/accounts/${accountId}/${row.resource}`,{method:'POST',body:JSON.stringify(body)});
      if (!posted.objectCreated?._id) throw apiFault(502,'No se recibió el ID del movimiento inicial.');
      row.id = posted.objectCreated._id; createdMovementIds.push(row.id);
    }
    const [deposits,withdrawals,account] = await Promise.all([nessie(`/accounts/${accountId}/deposits`),nessie(`/accounts/${accountId}/withdrawals`),nessie(`/accounts/${accountId}`)]);
    for (const row of plan) {
      const actual = (row.resource === 'deposits' ? deposits : withdrawals).find(item=>item._id===row.id);
      if (!actual || actual.amount !== row.amount || actual.description !== row.description || actual.transaction_date !== row.date || actual.status !== 'completed') throw apiFault(502,'Un movimiento inicial aún no coincide con el historial.');
    }
    if (account._id !== accountId || account.customer_id !== customerId || typeof account.balance !== 'number') throw apiFault(502,'La cuenta leída no coincide con el alta.');
    verification.status = 'verified'; verification.movementCount = createdMovementIds.length;
    return { objectCreated:account, verification };
  } catch (error) {
    // Se conserva el ID remoto; no se rehace el POST ni se inventa el lote faltante.
    return { objectCreated:result.objectCreated, verification, warning:`La cuenta ${accountId} existe, pero el alta inicial quedó parcial. ${error.message} Revisa sus movimientos; no vuelvas a crearla para completar el lote.` };
  }
}
