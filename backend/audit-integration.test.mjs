// Opt-in: crea una sola empresa QA, una cuenta y sus tres movimientos; no elimina registros.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
if(!process.argv.includes('--sandbox-write')) throw Error('Esta prueba crea datos en Nessie. Usa --sandbox-write con autorización.');
const api='http://127.0.0.1:8787/api/'; let cookie='';
async function call(route,method='GET',body){
  const response=await fetch(api+route,{method,signal:AbortSignal.timeout(120000),headers:{'X-Busynessy-Request':'1',Origin:'http://127.0.0.1:5173',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json(); if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  assert(response.ok,`${route}: HTTP ${response.status} ${data.error || data.warning || ''}`);
  return {data,requestId:response.headers.get('x-request-id')};
}
const suffix=Date.now(),username='qa-api-'+suffix,password=randomBytes(24).toString('hex');
const {data:registration,requestId}=await call('auth/register','POST',{username,password,name:'QA Auditoría Nessie '+suffix,firstName:'QA Auditoria',accountType:'Checking'});
assert(!registration.warning,registration.warning); assert.equal(registration.verification.status,'verified');
const customerId=registration.user.companyId,accountId=registration.account._id;
assert.equal(registration.user.primaryAccountId,accountId);
const {data:identity}=await call('auth/me'); assert.equal(identity.customer._id,customerId); assert.equal(identity.customer.first_name,'QA Auditoria'); assert(identity.customer.address.street_number);
const {data:accounts}=await call('accounts/'+customerId); assert.equal(accounts.length,1); assert.equal(accounts[0]._id,accountId);
const {data:dashboard}=await call('dashboard/'+accountId);
assert.equal(dashboard.account._id,accountId); assert.equal(dashboard.account.customer_id,customerId);
assert.equal(dashboard.insights.forecast.balance,dashboard.account.balance);
const rows=Object.values(dashboard.movements).flat(); assert.equal(rows.length,3);
for(const id of registration.verification.createdMovementIds) assert(rows.some(row=>row._id===id));
await call('auth/logout','POST');
await call('auth/login','POST',{username,password});
assert.equal((await call('auth/me')).data.user.primaryAccountId,accountId);
const unchanged=await call('dashboard/'+accountId); assert.equal(Object.values(unchanged.data.movements).flat().length,3);
await call('auth/logout','POST');
const audit=fs.readFileSync(new URL('./.data/nessie-audit.jsonl',import.meta.url),'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(row=>row.requestId===requestId);
assert.equal(audit.filter(row=>row.method==='POST').length,5);
assert(audit.every(row=>row.status>=200&&row.status<300));
assert(audit.some(row=>row.method==='GET'&&row.path==='/customers/'+customerId));
assert(audit.filter(row=>row.method==='GET'&&row.path==='/accounts/'+accountId).length>=2);
assert(!JSON.stringify(audit).includes(password)); assert(!JSON.stringify(audit).includes('key='));
const report={at:new Date().toISOString(),requestId,customerId,accountId,initialBalanceVerified:registration.verification.openingBalance,reportedBalance:dashboard.account.balance,movementIds:rows.map(row=>row._id),calls:audit.map(({method,path,status,resourceId})=>({method,path,status,...(resourceId?{resourceId}:{})})),loginDidNotReseed:true};
fs.writeFileSync(new URL('./.data/nessie-verification.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));
console.log('PASS: alta API end-to-end, perfil, IDs persistentes, tres movimientos, saldo GET y trazas reales; datos QA conservados.');
