# BusyNessy · Integración Nessie

## Resultado de la auditoría — 12 de septiembre de 2026

La versión anterior ya creaba customers y accounts mediante POST reales. No había cuentas mockeadas en React; se había desactivado el lote inicial por una petición anterior. Esta revisión cambia esa política: cada alta crea datos QA en Nessie y verifica su lectura posterior.

Servidor: https://prod-api.nessieisreal.com. Se comparó con el alias anterior https://api.nessieisreal.com: ambos devolvieron HTTP 200 y los mismos 12 customer IDs existentes antes de la prueba. No se migraron ni eliminaron esos datos.

Referencia oficial: [documentación](https://nessieisreal.com/docs), [OpenAPI](https://nessieisreal.com/nessie-openapi-spec.yaml). La especificación describe algunas respuestas como texto e IDs de 24 caracteres, pero la instancia devuelve objectCreated._id y UUIDs. Se conservan los IDs efectivamente devueltos, sin truncarlos.

## Ejecutar

Requiere Node.js 18+. Configura NESSIE_API_KEY y CLERK_SECRET_KEY en el entorno o en archivos locales ignorados por Git. NESSIE_API_BASE_URL es opcional; por defecto usa el servidor oficial HTTPS.

```sh
node server.mjs
```

Backend: http://127.0.0.1:8787. Frontend activo: ../exportacion-frontend, http://127.0.0.1:5173/. Consola: /#consola. No se cambió la copia busynessy-github ni se hizo push.

## Flujo de alta

1. El acceso se inicia en Clerk. POST /api/auth/clerk/provision recibe el token de sesión verificado y el nombre del negocio. firstName, lastName y campos de address pueden omitirse: el backend completa solo los vacíos con datos de Ciudad de México. Los campos aportados se conservan y validan.
2. POST /customers guarda el perfil en Nessie. Se persiste el customer_id devuelto como vínculo de autorización y se verifica nombre/dirección mediante GET /customers/{id}.
3. POST /customers/{id}/accounts crea una cuenta Checking o Savings con saldo aleatorio entero de USD 5,000–15,000. Se guarda el account_id remoto, nunca un ID local sustituto.
4. GET /accounts/{id} confirma cuenta, dueño y saldo inicial.
5. Cincuenta POST de depósitos y retiros crean un historial entre enero y el mes actual. Las descripciones tienen contraparte, referencia y concepto legibles; el conjunto incluye cinco patrones de gasto atípico y duplicados para alimentar las alertas.
6. GET de depósitos, retiros y cuenta verifica IDs, importes, descripciones, fechas y estados. Solo entonces verification.status es verified.

La consola puede abrir cuentas adicionales del MISMO customer de la empresa autenticada, con el mismo lote inicial. Un nuevo registro crea otro customer; una cuenta adicional no crea otra empresa ni rompe el aislamiento.

No se repite el lote al consultar, recargar o iniciar sesión. No hay retry automático de POST/PUT/DELETE. Ante un fallo parcial se conserva el ID de cuenta devuelto, se informa qué IDs se crearon y se pide revisar el historial. Nessie no ofrece transacciones distribuidas ni idempotencia duradera para este flujo: no repetir un alta ambigua.

## Fuente de verdad

Perfiles, direcciones, nombres bancarios, cuentas, saldo y movimientos se consultan desde Nessie. El nombre visual de empresa procede del nickname de la cuenta principal (sin el sufijo · Operación); si no hay cuentas, se usa el nombre del customer. Nessie no tiene un campo propio de razón social.

auth/me consulta perfil y cuentas remotos. El dashboard devuelve el account completo, sus movimientos y los cálculos de insights/forecast. Las lecturas repetidas no inventan operaciones ni actualizan balances localmente. React mantiene solo la última lectura y muestra errores si no puede sincronizar. localStorage conserva preferencias de cuenta/accesibilidad, no saldos ni historiales.

La prueba observó que el saldo de cuenta permaneció en USD 5,901 después de registrar los tres movimientos. Se muestra ese valor reportado por GET; NO se sustituye por la suma local de movimientos ni se supone liquidación inmediata del sandbox. Flujo histórico y saldo son indicadores diferentes.

La identidad y el inicio/cierre de sesión los administra Clerk. Cada llamada protegida lleva el token de Clerk al backend, que resuelve el perfil, la empresa y las cuentas desde Supabase. No hay sesiones, contraseñas, perfiles, metas ni revisiones persistidas en archivos locales. El rol administrativo se concede solo cuando publicMetadata.role es admin en Clerk.

## Endpoints por acción

Todos los endpoints Nessie llevan key como query exclusivamente desde el backend.

| Acción BusyNessy | Ruta del backend | Operaciones Nessie |
|---|---|---|
| Registrar empresa | POST /api/auth/clerk/provision con token de Clerk | POST /customers; GET /customers/{customerId}; alta de cuenta y lote descritos arriba |
| Crear cuenta adicional | POST /api/accounts | POST /customers/{customerId}/accounts; GET /accounts/{accountId}; POST y GET del lote |
| Iniciar/restaurar sesión | POST /api/auth/clerk/session; GET /api/auth/me | GET /customers/{customerId}; GET /customers/{customerId}/accounts |
| Consultar empresa | GET /api/customers | GET /customers/{customerId}; solo la empresa autenticada |
| Listar cuentas | GET /api/accounts/{customerId} | GET /customers/{customerId}/accounts |
| Dashboard y saldo | GET /api/dashboard/{accountId} | GET /accounts/{accountId}; GET /accounts/{accountId}/{deposits,withdrawals,purchases,bills}; GET /merchants, previa autorización |
| Historial | GET /api/movements/{accountId} | GET de los cuatro recursos anteriores |
| Depositar | POST /api/movements, type=deposit | POST /accounts/{accountId}/deposits |
| Retirar | POST /api/movements, type=withdrawal | POST /accounts/{accountId}/withdrawals |
| Comprar | POST /api/movements, type=purchase | POST /accounts/{accountId}/purchases |
| Factura | POST /api/movements, type=bill | POST /accounts/{accountId}/bills |
| Editar/eliminar movimiento (solo API) | PUT/DELETE /api/movements/{type}/{id} | /deposits/{id}, /withdrawal/{id}, /purchase/{id}, /bills/{id} |
| Eliminar cuenta | DELETE /api/accounts/{accountId} | DELETE /accounts/{accountId}, irreversible |
| Comercios | GET/POST /api/merchants | GET/POST /merchants con datos proporcionados |
| Cerrar sesión | POST /api/auth/logout y cierre de sesión en Clerk | Revocación propia de BusyNessy; Nessie no ofrece esta sesión |

No existe un endpoint genérico /transactions en la especificación consultada.

Discrepancias documentales: OpenAPI no enumera las rutas de purchases por cuenta, aunque el GET usado por la integración respondió 200 y el CRUD ya había sido probado en una revisión anterior. El POST de purchases no se volvió a ejecutar en esta auditoría. Quick Start menciona POST /accounts/{id}/transfers, pero la sección Transfers/OpenAPI solo incluye GET/PUT/DELETE por transfer_id. Transferencias permanecen deshabilitadas; type=transfer responde 501 antes de enviar operaciones. No se reemplazan por depósitos/retiros locales. Se requiere confirmar su contrato antes de habilitarlas.

## Validación y errores

- Clave solo en servidor; URL y payload se pasan a curl por stdin, no en los argumentos del proceso.
- Logs JSON incluyen requestId, método, path SIN query, estado HTTP, duración e ID creado. No contienen clave, contraseña, cookie, dirección, importe ni cuerpo de respuesta.
- Timeout por llamada de 25 s; presupuesto de 240 s por petición compuesta durante un alta completa.
- HTTP 429: respeta Retry-After (o 30 s si falta), pausa compartida del cliente y espera progresiva en React. No repite escrituras.
- Errores de credencial upstream se devuelven como error de configuración 502, no como 401 de usuario. Fallos de datos: 422; conexión: 503; timeout: 504; JSON inválido: 502.
- Respuestas parciales y errores no generan datos de respaldo. Revisa GET antes de reintentar una operación ambigua.
- Importes positivos enteros, fechas calendario válidas, dirección estadounidense y autorización de empresa/cuenta/movimiento en servidor.
- Cookies HttpOnly/SameSite=Strict, expiración de ocho horas, CORS local y X-Busynessy-Request obligatorio en mutaciones.

## Evidencia y pruebas

Se creó UNA empresa QA nueva y una cuenta, con tres movimientos conservados:
customer_id: 3e31736c-cdf3-4cae-a53a-e5dfa6b70b55
account_id: 803dcedc-c5e6-4576-b913-30f44f98647d
request_id del alta: faf31720-2c41-4cc0-b718-84a63e22f81d

Cinco POST respondieron 201 y cinco GET de verificación respondieron 200 en el mismo trace. Se comprobó login posterior, persistencia del account_id y ausencia de un segundo lote. Evidencia local: .data/nessie-verification.json; llamadas: .data/nessie-audit.jsonl. Ambos excluidos de Git.

```sh
node --test auth.test.mjs insights.test.mjs forecast.test.mjs nessie.test.mjs
```

20 pruebas locales aprobadas. Los transportes en memoria existen solo en tests; nunca son importados por el servidor. En frontend: node dashboard.test.mjs y npm run build.

Prueba real optativa (CREA otra empresa cada vez; no repetir sin autorización):
```sh
node audit-integration.test.mjs --sandbox-write
```

auth-integration.test.mjs --sandbox-write crea dos empresas y verifica aislamiento; smoke-test.mjs --sandbox-write crea y elimina recursos de su cuenta QA. No se ejecutaron en esta auditoría.

## Límites antes de producción

Es un sandbox local, no banca real. Producción requiere HTTPS/cookies Secure, base transaccional, recuperación/verificación de identidad, idempotencia, respaldo, auditoría de seguridad, retención de trazas y revisión legal. No publicar .env ni .data.
