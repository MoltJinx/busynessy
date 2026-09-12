# Busynessy backend

Proxy local de desarrollo para el sandbox Nessie. No es banca real ni autenticación de producción.

## Ejecutar

Requiere Node.js 18+ y curl en PATH. Desde esta carpeta, copia `.env.example` a `.env`, configura tu clave y ejecuta `npm run dev`.
También acepta `NESSIE_API_KEY` del entorno. Escucha solo en `127.0.0.1:8787` (puerto configurable con `PORT`).
Frontend separado en `http://127.0.0.1:4173`; no se publica en esta rama.

## Rutas

- `GET /api/customers`; `POST /api/customers` con `{name,city}`.
- `GET /api/accounts/:customerId`; `POST /api/accounts` con `{customerId,nickname,balance}`.
- `DELETE /api/accounts/:accountId`: eliminación irreversible.
- `POST /api/bootstrap` con `{name}`: cliente, cuenta, depósito y diez retiros aleatorios. No es atómico: ante fallo, consultar antes de reintentar.
- `GET /api/merchants`: comercios disponibles. `POST /api/merchants` con `{name}` crea un comercio con dirección de demostración.
- `GET /api/movements/:accountId`: `{deposits,withdrawals,purchases,bills}` desde Nessie.
- `POST /api/movements`: `{accountId,type,amount,description,date,status,merchantId?,payee?}`.
- `PUT /api/movements/:type/:id`: mismos campos editables, formulario completo.
- `DELETE /api/movements/:type/:id`: eliminación irreversible.

Tipos: deposit, withdrawal, purchase, bill. Fechas YYYY-MM-DD. Compra requiere merchantId; factura requiere payee. Estados: pending, cancelled, completed; facturas también recurring (día mensual tomado de date).

Nessie no admite cambiar merchant_id ni status al editar compras: se conservan. En facturas enviamos recurring_date (día de date) incluso sin recurrencia para evitar un fallo de validación de lectura del sandbox; solo status=recurring indica recurrencia.

## Prueba de integración

Con el servidor iniciado: `node smoke-test.mjs --sandbox-write`. Requiere al menos un cliente existente. Crea una cuenta temporal, verifica crear/leer/editar/borrar depósitos, retiros, compras y facturas y elimina su propia cuenta. Si no existen comercios crea y conserva uno de QA para pruebas posteriores. La prueba escribe en el sandbox, nunca en un banco real.

App y consola consultan el mismo historial cada 3 segundos. Compras y facturas completadas se suman a gastos; pendientes/canceladas no. No duplicar una factura pagada como retiro. El flujo neto del historial no es el saldo bancario.

## Seguridad

Clave exclusivamente en servidor, nunca en Git. CORS restringido a localhost:4173 y 127.0.0.1:4173; errores de curl sanitizados. No exponer a Internet: demo local sin usuarios/roles. Producción requiere autenticación, autorización por empresa, límites de peticiones y auditoría.

API: https://api.nessieisreal.com · Documentación: https://nessieisreal.com/docs
