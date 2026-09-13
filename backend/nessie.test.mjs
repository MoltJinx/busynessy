import test from 'node:test';
import assert from 'node:assert/strict';
import { createNessieClient, apiFault, nessieTrace } from './nessie.mjs';
import { buildInitialHistory, customerPayload, provisionAccount } from './provisioning.mjs';
import { analyzeAccount } from './insights.mjs';

test('cliente envía clave solo al host permitido y registra trazas sin secretos',async()=>{
  const logs=[],seen=[];
  const client=createNessieClient({key:'secret-test-key',logger:line=>logs.push(line),transport:async request=>{seen.push(request);return{status:201,text:JSON.stringify({objectCreated:{_id:'remote-id'}})};}});
  await nessieTrace.run({requestId:'trace-test'},()=>client('/customers',{method:'POST',body:'{"first_name":"Private name"}'}));
  assert.equal(new URL(seen[0].url).origin,'https://prod-api.nessieisreal.com');
  assert.equal(new URL(seen[0].url).searchParams.get('key'),'secret-test-key');
  assert(!logs.join('').includes('secret-test-key')); assert(!logs.join('').includes('Private name'));
  assert.equal(JSON.parse(logs[0]).resourceId,'remote-id'); assert.equal(JSON.parse(logs[0]).requestId,'trace-test');
  assert.throws(()=>createNessieClient({key:'x',baseUrl:'https://example.org'}));
  await assert.rejects(client('/customers?key=other'),e=>e.status===400);
});
test('429 respeta Retry-After y no reintenta un POST',async()=>{
  let clock=0,calls=0;
  const client=createNessieClient({key:'x',logger:()=>{},now:()=>clock,transport:async()=>{calls++;return{status:429,text:'',retryAfter:'12'};}});
  await assert.rejects(client('/customers',{method:'POST'}),e=>e.status===429&&e.retryAfter===12);
  clock=5000;
  await assert.rejects(client('/customers'),e=>e.status===429&&e.retryAfter===7);
  assert.equal(calls,1);
});
test('timeout, credencial del proveedor y JSON inválido no producen éxito ni logout local',async()=>{
  for(const transport of [async()=>{throw apiFault(504,'Nessie tardó demasiado.');},async()=>({status:401,text:'private server error'}),async()=>({status:200,text:'not JSON'})]){
    let calls=0;
    const client=createNessieClient({key:'x',logger:()=>{},transport:async request=>{calls++;return transport(request);}});
    await assert.rejects(client('/customers',{method:'POST'}),e=>[502,504].includes(e.status)&&!e.message.includes('private server error'));
    assert.equal(calls,1);
  }
});
test('perfil conserva campos aportados y genera solo los ausentes para POST',()=>{
  const profile=customerPayload({firstName:'Luis',address:{street_name:'Mi calle',state:'ca',zip:'90210'}});
  assert.equal(profile.first_name,'Luis'); assert.equal(profile.address.street_name,'Mi calle'); assert.equal(profile.address.state,'CA');
  assert(profile.last_name.startsWith('Registro')); assert(profile.address.street_number);
  const mexican = customerPayload({});
  assert.equal(mexican.address.city,'Ciudad de México'); assert.equal(mexican.address.state,'CDMX'); assert.equal(mexican.address.zip,'06600');
  assert.throws(()=>customerPayload({address:{zip:'invalid'}}));
});
test('historial inicial contiene 50 movimientos legibles de enero al mes actual y genera alertas accionables',()=>{
  const now = new Date('2026-09-12T12:00:00Z'), plan = buildInitialHistory(now);
  assert.equal(plan.length,50);
  assert(plan.every(row => ['deposits','withdrawals'].includes(row.resource) && row.date >= '2026-01-01' && row.date <= '2026-09-12' && row.description.includes(' — ') && !/^[A-Z]{3,}-\d+ compra/i.test(row.description)));
  assert.equal(new Set(plan.map(row=>row.description)).size,48);
  const deposits = plan.filter(row=>row.resource==='deposits').map((row,index)=>({_id:'d'+index,amount:row.amount,transaction_date:row.date,status:'completed',description:row.description}));
  const withdrawals = plan.filter(row=>row.resource==='withdrawals').map((row,index)=>({_id:'w'+index,amount:row.amount,transaction_date:row.date,status:'completed',description:row.description}));
  const insights = analyzeAccount({deposits,withdrawals,purchases:[],bills:[]}, [], 10000, {}, now);
  assert(insights.alerts.length >= 5);
  assert(insights.alerts.some(alert=>alert.title.includes('Mr. Apple México')));
  assert(insights.alerts.every(alert=>/^(Monto inusual|Posible duplicado):/.test(alert.title)));
});

// Transporte en memoria exclusivo de pruebas: nunca se importa desde server.mjs.
function accountFixture(failAt = '') {
  const calls=[],deposits=[],withdrawals=[]; let account;
  return {calls,request:async(endpoint,options={})=>{
    const method=options.method||'GET'; calls.push([method,endpoint]);
    if(endpoint===failAt && method==='POST') throw apiFault(503,'Fallo controlado de prueba');
    if(method==='POST'){
      const data=JSON.parse(options.body);
      if(endpoint.endsWith('/accounts')) {account={...data,_id:'account-api',customer_id:'customer-api'};return{objectCreated:account};}
      const row={...data,_id:'movement-api-'+calls.length};
      (endpoint.endsWith('/deposits')?deposits:withdrawals).push(row); return{objectCreated:row};
    }
    if(endpoint.endsWith('/deposits'))return deposits;
    if(endpoint.endsWith('/withdrawals'))return withdrawals;
    return {...account};
  }};
}
test('alta exige POST y luego GET de cuenta y 50 movimientos con IDs devueltos',async()=>{
  const remote=accountFixture(); let linked;
  const result=await provisionAccount(remote.request,'customer-api',{nickname:'QA',type:'Savings'},id=>linked=id);
  assert.equal(linked._id,'account-api'); assert.equal(result.objectCreated.type,'Savings');
  assert(result.objectCreated.balance>=5000&&result.objectCreated.balance<=15000);
  assert.equal(result.verification.status,'verified'); assert.equal(result.verification.createdMovementIds.length,50);
  assert.equal(result.verification.movementCount,50);
  assert.equal(remote.calls.filter(([method])=>method==='POST').length,51);
  assert(remote.calls.some(([method,path])=>method==='GET'&&path==='/accounts/account-api/deposits'));
});
test('fallo parcial conserva ID, informa el error y no duplica la cuenta',async()=>{
  const remote=accountFixture('/accounts/account-api/withdrawals');
  const result=await provisionAccount(remote.request,'customer-api',{nickname:'QA'});
  assert(result.warning); assert.equal(result.objectCreated._id,'account-api');
  assert.equal(result.verification.status,'partial'); assert(result.verification.createdMovementIds.length > 0 && result.verification.createdMovementIds.length < 50);
  assert.equal(remote.calls.filter(([method,path])=>method==='POST'&&path.endsWith('/accounts')).length,1);
});
