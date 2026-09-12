import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';

export const nessieTrace = new AsyncLocalStorage();
const allowedHosts = new Set(['prod-api.nessieisreal.com','api.nessieisreal.com','qa-api.nessieisreal.com']);
export const apiFault = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// curl recibe URL/clave y payload por stdin, no como argumentos visibles del proceso.
export function curlTransport({ url, method, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--silent','--show-error','--max-time',String(timeoutMs/1000),
      '--write-out','\n%{http_code}\n%header{retry-after}','--config','-',
    ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) return reject(apiFault(error.code === 28 ? 504 : 503, error.code === 28 ? 'La operación tardó demasiado en responder.' : 'No se pudo conectar con el servicio.'));
      const last = stdout.lastIndexOf('\n'), previous = stdout.lastIndexOf('\n',last-1);
      resolve({ status: Number(stdout.slice(previous+1,last)), text: stdout.slice(0,previous), retryAfter: stdout.slice(last+1).trim() });
    });
    child.stdin.on('error', () => {});
    child.stdin.end('url = '+JSON.stringify(url)+'\nrequest = '+JSON.stringify(method)+'\nheader = "Content-Type: application/json"\n'+(body ? 'data = '+JSON.stringify(body)+'\n' : ''));
  });
}

export function createNessieClient({ key, baseUrl = 'https://prod-api.nessieisreal.com', auditFile, transport = curlTransport, now = Date.now, timeoutMs = 25000, logger = console.info }) {
  if (!key || key === 'replace_with_your_nessie_key') throw Error('Configura NESSIE_API_KEY en backend o en el entorno.');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || !allowedHosts.has(base.hostname) || base.port || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('NESSIE_API_BASE_URL debe ser un servidor HTTPS de Nessie permitido.');
  if (auditFile) fs.mkdirSync(path.dirname(auditFile), { recursive: true });
  let blockedUntil = 0;
  return async function nessie(endpoint, { method = 'GET', body } = {}) {
    if (!/^\/[a-zA-Z0-9_/-]+$/.test(endpoint) || !['GET','POST','PUT','DELETE'].includes(method)) throw apiFault(400,'Ruta o método inválido.');
    if (blockedUntil > now()) throw apiFault(429,'Se alcanzó el límite de solicitudes. Espera antes de actualizar.', { retryAfter: Math.ceil((blockedUntil-now())/1000) });
    const remaining = (nessieTrace.getStore()?.deadline || now()+timeoutMs)-now();
    if (remaining <= 0) throw apiFault(504,'Se agotó el tiempo de la operación. Revisa el historial antes de reintentar.');
    const url = new URL(endpoint, base); url.searchParams.set('key',key);
    const started = now();
    const audit = { at: new Date(started).toISOString(), requestId: nessieTrace.getStore()?.requestId || 'background', host: base.hostname, method, path: endpoint };
    try {
      const response = await transport({ url: url.toString(), method, body, timeoutMs:Math.min(timeoutMs,remaining) });
      audit.status = response.status;
      if (response.status === 429) {
        const seconds = /^\d+$/.test(response.retryAfter || '') ? Number(response.retryAfter) : Math.ceil((Date.parse(response.retryAfter)-now())/1000);
        const retryAfter = Math.min(3600, Math.max(1, Number.isFinite(seconds) ? seconds : 30));
        blockedUntil = now()+retryAfter*1000;
        throw apiFault(429,`Se alcanzó el límite de solicitudes. Intenta de nuevo en ${retryAfter} segundos.`,{ retryAfter });
      }
      if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
        const message = response.status === 401 || response.status === 403 ? 'El servicio rechazó la configuración del servidor.' : response.status >= 500 ? 'El servicio no está disponible. Revisa el historial antes de repetir una operación.' : 'Se rechazaron los datos de la operación. Revisa los campos y el historial antes de reintentar.';
        throw apiFault(response.status === 400 || response.status === 422 ? 422 : 502, `${message} (HTTP ${response.status})`);
      }
      if (response.status === 204) return { deleted: true };
      let data;
      try { data = JSON.parse(response.text); } catch { throw apiFault(502,'El servicio devolvió una respuesta no válida; no se puede confirmar la operación.'); }
      if (data?.objectCreated?._id) audit.resourceId = data.objectCreated._id;
      return data;
    } catch (error) {
      audit.errorStatus = error.status || 503;
      // No se propagan cuerpos, URLs con query, errores de curl ni datos personales.
      if ([422,429,502,503,504].includes(error.status)) throw error;
      throw apiFault(503,'No se pudo completar la operación. Revisa el historial antes de reintentar.');
    } finally {
      audit.durationMs = now()-started;
      const line = JSON.stringify(audit);
      logger(line);
      if (auditFile) fs.appendFileSync(auditFile,line+'\n',{mode:0o600});
    }
  };
}
