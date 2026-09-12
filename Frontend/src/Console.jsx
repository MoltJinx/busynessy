import React, { useState } from 'react';
import { AddressFields, Card, ConfirmDialog, Field, Help, MovementTable, Title, readAddress } from './components.jsx';
import { money, types, statuses } from './data.js';
import { presentText } from './api.js';

export default function Console({ adminMode = false, selectors, companyId, accountId, accounts, movements, merchants, busy, sessionBusy = false, ready, mutate, selectAccount, onApp, onLogout }) {
  const [type,setType] = useState('deposit'), [confirmation,setConfirmation] = useState(null);
  const disabled = busy || !ready;
  return <main id="main-content" tabIndex="-1" className="console">
    <header className="page-heading"><div><p className="eyebrow">BUSYNESSY</p><h1>{adminMode ? 'Consola de administración' : 'Consola de operaciones'}</h1></div><div className="button-row">{!adminMode && <button className="secondary" disabled={sessionBusy} onClick={onApp}>Abrir aplicación</button>}<button className="secondary" disabled={sessionBusy} onClick={onLogout}>Cerrar sesión</button></div></header>
    <>
    <Card><Title>Empresa y cuenta</Title>{selectors}<div className="button-row"><button className="danger secondary" disabled={disabled || !accountId} onClick={() => setConfirmation({kind:'delete',id:accountId,name:accounts.find(row=>row.id===accountId)?.name})}>Eliminar cuenta</button></div>
      <details open={!accountId}><summary>Crear cuenta</summary><form onSubmit={async event => {
        event.preventDefault(); const form=event.currentTarget; const nickname=new FormData(form).get('nickname').trim();
        try { const result=await mutate('accounts',{customerId:companyId,nickname,type:new FormData(form).get('accountType')}); selectAccount(result.objectCreated._id); form.reset(); } catch {}
      }}><Field label="Nombre de cuenta" help="La cuenta pertenece a tu empresa y queda disponible al finalizar el registro."><input name="nickname" required maxLength="100" disabled={busy}/></Field><Field label="Tipo de cuenta"><select name="accountType" disabled={busy}><option value="Checking">Operativa (Checking)</option><option value="Savings">Ahorro (Savings)</option></select></Field><button disabled={disabled || !companyId}>Crear cuenta</button></form></details>
    </Card>
    <Card><Title help="La operación se enviará a la cuenta seleccionada. Confirma importe, fecha y estado antes de registrar.">Registrar movimiento</Title>
      {!accountId && <p className="notice warning">Crea una cuenta para registrar operaciones.</p>}
      <form onSubmit={event => {
        event.preventDefault(); const form=event.currentTarget, data=new FormData(form);
        setConfirmation({kind:'movement',form,payload:{accountId,type,amount:Number(data.get('amount')),description:data.get('description').trim(),date:data.get('date'),status:data.get('status'),payee:data.get('payee'),merchantId:data.get('merchant')}});
      }}><fieldset disabled={disabled || !accountId}><legend className="sr-only">Datos del movimiento</legend><div className="form-grid">
        <Field label="Tipo" help="Las transferencias permanecen deshabilitadas hasta completar su configuración."><select value={type} onChange={event=>setType(event.target.value)}>{Object.entries(types).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="transfer" disabled>Transferencia (no disponible)</option></select></Field>
        <Field label="Monto (USD)" help="Ingresa dólares enteros."><input name="amount" type="number" min="1" max="1000000000" step="1" inputMode="numeric" required/></Field>
        <Field label="Descripción"><input name="description" maxLength="250" required/></Field>
        <Field label="Fecha"><input name="date" type="date" required/></Field>
        <Field label="Estado" help="Solo operaciones completadas aumentan ingresos o gastos. Las facturas pendientes son compromisos futuros; no registres también un retiro para el mismo pago."><select key={type} name="status" defaultValue={type==='bill'?'pending':'completed'}>{Object.entries(statuses).filter(([value])=>type==='bill'||value!=='recurring').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
        {type==='purchase' && <Field label="Comercio"><select name="merchant" defaultValue="" required><option value="">Seleccionar comercio</option>{merchants.map(row=><option key={row._id} value={row._id}>{row.name}</option>)}</select></Field>}
        {type==='bill' && <Field label="Beneficiario"><input name="payee" required maxLength="120"/></Field>}
      </div><button disabled={type==='purchase'&&!merchants.length}>Revisar operación</button></fieldset></form>
    </Card>
    <Card><details><summary>Registrar comercio</summary><form onSubmit={async event=>{
      event.preventDefault(); const form=event.currentTarget, data=new FormData(form);
      try { await mutate('merchants',{name:data.get('merchant'),category:data.get('category'),address:readAddress(data),lat:data.get('lat'),lng:data.get('lng')}); form.reset(); } catch {}
    }}><fieldset disabled={disabled}><legend className="sr-only">Datos del comercio</legend>
      <div className="form-grid"><Field label="Nombre del comercio"><input name="merchant" required maxLength="100"/></Field><Field label="Categoría"><input name="category" required maxLength="100"/></Field></div>
      <AddressFields disabled={disabled}/><div className="form-grid">
        <Field label="Latitud" help="Ubicación del comercio, entre −90 y 90 grados. No se asigna una ubicación predeterminada."><input name="lat" type="number" step="any" min="-90" max="90" required/></Field>
        <Field label="Longitud"><input name="lng" type="number" step="any" min="-180" max="180" required/></Field>
      </div><button>Registrar comercio</button></fieldset></form></details>
    </Card>
    <Card><Title>Historial de la cuenta</Title><p className="result-count">{movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}</p><MovementTable movements={movements}/></Card>
    {confirmation && <ConfirmDialog title={confirmation.kind==='delete'?'Eliminar cuenta':'Confirmar movimiento'} destructive={confirmation.kind==='delete'} busy={busy} onCancel={()=>setConfirmation(null)} onConfirm={async()=>{
      try {
        if(confirmation.kind==='delete') { await mutate('accounts/'+confirmation.id,undefined,'DELETE'); selectAccount(''); }
        else { await mutate('movements',confirmation.payload); confirmation.form.reset(); }
        setConfirmation(null);
      } catch (failure) { setConfirmation(current=>({...current,error:failure.message})); }
    }}>{confirmation.error && <p className="notice warning" role="alert">{confirmation.error} Revisa la cuenta antes de reintentar.</p>}{confirmation.kind==='delete'?<p>Se eliminará «{confirmation.name}» y su historial. Esta acción no se puede deshacer.</p>:<>
      <p>{types[confirmation.payload.type]} · <strong>{money(confirmation.payload.amount)}</strong></p><p>{presentText(confirmation.payload.description)}</p><p>{confirmation.payload.date} · {statuses[confirmation.payload.status]}</p><p>Cuenta: {accounts.find(row=>row.id===confirmation.payload.accountId)?.name}</p>
    </>}</ConfirmDialog>}
    </>
    <footer>BusyNessy · Operaciones</footer>
  </main>;
}
