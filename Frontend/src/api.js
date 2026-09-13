// El navegador solo habla con nuestro backend. La clave permanece en el servidor.
// La ruta es relativa para que funcione desde otra computadora o dispositivo.
// Vite la redirige al backend local sin exponer sus claves al navegador.
const API_URL = '/api/';
let tokenProvider = null;

// El token de Clerk se adjunta a cada llamada protegida. El navegador no
// conserva una sesión propia ni credenciales de la base de datos.
export function setTokenProvider(provider) {
  tokenProvider = provider;
}

// Adaptación de textos para presentación; nunca se aplica a IDs, importes,
// fechas, credenciales ni payloads enviados al banco.
export function presentText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/nessie|sand[\s_-]*box|modo[\s_-]+(?:de[\s_-]+)?pruebas?|test[\s_-]*mode|demo[\s_-]*mode|modo[\s_-]+(?:de[\s_-]+)?demo/gi, '')
    .replace(/\s*[·—–-]\s*(?=$|[.:;,])/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[:·—–-]\s*|\s*[:·—–-]\s*$/g, '')
    .trim();
}

const DISPLAY_FIELDS = new Set([
  'name', 'companyName', 'first_name', 'last_name', 'nickname', 'description',
  'payee', 'category', 'street_name', 'city', 'title', 'label', 'reason',
  'message', 'error', 'warning', 'warnings', 'detail', 'details',
]);

export function presentResponse(value, field = '') {
  if (typeof value === 'string') return DISPLAY_FIELDS.has(field) ? presentText(value) : value;
  if (Array.isArray(value)) return value.map(item => presentResponse(item, field));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, presentResponse(item, key)]),
  );
  return value;
}

export async function request(route, { method = 'GET', body, signal, token } = {}) {
  const accessToken = token || await tokenProvider?.();
  let response;
  try {
    response = await fetch(API_URL + route, {
      method,
      credentials: 'include',
      signal: signal || AbortSignal.timeout(method === 'GET' ? 35000 : 240000),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-Busynessy-Request': '1' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw Error('No hay conexión con el servicio. Intenta actualizar en unos momentos.');
  }
  let data;
  try { data = await response.json(); } catch { throw Error('El servicio devolvió una respuesta no válida. No se pudo confirmar la operación.'); }
  if (!response.ok) throw Object.assign(Error(presentText(data.error) || 'La API rechazó la solicitud.'), { status: response.status, retryAfter:Number(data.retryAfter || response.headers.get('Retry-After')) || 0, requestId:data.requestId });
  return presentResponse(data);
}

// Conservamos el ID de Nessie y unificamos las diferencias entre facturas,
// compras, depósitos y retiros antes de pasarlos al dashboard.
export function normalizeMovements(data, accountId) {
  const resources = { deposits: 'deposit', withdrawals: 'withdrawal', purchases: 'purchase', bills: 'bill' };
  return Object.entries(resources).flatMap(([key, type]) => {
    if (!Array.isArray(data[key])) throw Error('Historial incompleto: ' + key);
    return data[key].map(item => {
      const amount = Number(item.amount ?? item.payment_amount), date = item.transaction_date || item.purchase_date || item.payment_date || '';
      if (!item._id || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw Error('Un movimiento contiene datos inválidos. No se actualizó el panel.');
      return ({
      id: item._id, accountId, type,
      description: presentText(item.description || item.nickname || item.payee || 'Sin descripción'),
      amount, date,
      status: item.status,
    }); });
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
