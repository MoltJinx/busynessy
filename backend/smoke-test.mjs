// Opt-in integration test: creates sandbox records, then deletes only its own account/movements.
import assert from 'node:assert/strict';
if (!process.argv.includes('--sandbox-write')) throw Error('Use --sandbox-write to authorize sandbox test records');
const api='http://127.0.0.1:8787/api/';
async function call(route,method='GET',body){const r=await fetch(api+route,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();assert(r.ok,`${method} ${route}: ${JSON.stringify(d)}`);return d;}
const customers=await call('customers');assert(customers.length,'Requires an existing sandbox customer');
let merchants=await call('merchants');if(!merchants.length){await call('merchants','POST',{name:'Busynessy QA Comercio'});merchants=await call('merchants');}
const customerId=customers[0]._id;
const account=(await call('accounts','POST',{customerId,nickname:'QA CRUD '+Date.now(),balance:10000})).objectCreated;
console.log('Test account:',account._id);
const keys={deposit:'deposits',withdrawal:'withdrawals',purchase:'purchases',bill:'bills'};
try{
 for(const type of Object.keys(keys)){
  const body={accountId:account._id,type,amount:12,description:'QA create',date:'2026-09-12',status:'pending',merchantId:merchants[0]._id,payee:'QA supplier'};
  const created=await call('movements','POST',body);const id=created.objectCreated?._id;assert(id,JSON.stringify(created));
  let history=await call('movements/'+account._id);assert(history[keys[type]].some(m=>m._id===id));
  await call(`movements/${type}/${id}`,'PUT',{...body,amount:19,description:'QA updated'});
  history=await call('movements/'+account._id);const updated=history[keys[type]].find(m=>m._id===id);assert.equal(updated.amount??updated.payment_amount,19);
  await call(`movements/${type}/${id}`,'DELETE');history=await call('movements/'+account._id);assert(!history[keys[type]].some(m=>m._id===id));
  console.log('PASS create/read/update/delete:',type);
 }
 const preflight=await fetch(api+'movements',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:4173','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);assert(preflight.headers.get('access-control-allow-methods').includes('DELETE'));console.log('PASS CORS preflight');
}finally{await call('accounts/'+account._id,'DELETE');const accounts=await call('accounts/'+customerId);assert(!accounts.some(a=>a._id===account._id));console.log('PASS delete own test account');}
