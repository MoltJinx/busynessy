# BusyNessy · Frontend React

App y consola conectadas al backend local. La fuente financiera es Nessie; React no crea saldos ni movimientos locales.

## Iniciar

Node.js 22.12+. Primero node server.mjs en ../backend. Luego:

```sh
npm install
npm run dev
```

App: http://127.0.0.1:5173/
Consola: http://127.0.0.1:5173/#consola

```sh
node dashboard.test.mjs
npm run build
```

dist/ es la compilación; npm run preview la sirve en 5174. No incluir claves ni backend en esta carpeta.

## Alta y sincronización

El registro pide negocio, usuario y contraseña. Los campos de responsable/dirección pueden omitirse para que el backend complete datos QA y los guarde mediante POST en Nessie. Se puede elegir Checking o Savings.

Cada alta crea en Nessie un saldo inicial de USD 5,000–15,000, un depósito y dos retiros QA. Solo se confirma tras GET de verificación. La consola abre cuentas adicionales del customer de la empresa. No crea datos en React ni vuelve a generar el lote en login/F5.

auth/me devuelve perfil y cuentas consultados de Nessie. La identidad bancaria, alias visible, saldo, historial e indicadores se releen periódicamente. localStorage contiene solo preferencia de cuenta y accesibilidad; no es fuente de autorización, saldo o transacciones. El backend conserva credenciales de BusyNessy e IDs vinculados porque Nessie no ofrece login para la app.

El sondeo espera tres segundos tras una lectura correcta. Ante error espera progresivamente; respeta Retry-After en límites de Nessie. Una escritura falla de forma visible, sin reintentarse automáticamente. Se conserva la última lectura con aviso de desactualización y las acciones quedan deshabilitadas.

El saldo es el reportado por GET /accounts/{id}; el flujo histórico no lo reemplaza. La instancia puede conservar el saldo aun después de registrar movimientos. No simular liquidación en el navegador.

## Componentes

- App.jsx: acceso, identidad, selección y sincronización.
- api.js: solicitudes al backend, errores y normalización.
- Dashboard.jsx: menú y vistas financieras en un solo archivo.
- Console.jsx: cuentas, depósitos, retiros, compras, facturas y comercios.
- components.jsx: campos, tarjetas, tablas, ayuda, modal y accesibilidad.
- data.js: etiquetas y cálculos derivados; no contiene datos bancarios.
- styles.css: negro, celeste y verde claro; diseño responsive.

Ahorro automático y transferencias están deshabilitados. La transferencia no se reemplaza por un par de movimientos inventados; falta confirmar su contrato en la especificación oficial. Los demás botones de operaciones llaman al backend, previa confirmación cuando corresponde.

## Accesibilidad y alcance

Ayudas ? con hover/foco/tap, Escape, teclado, modales con retorno de foco, avisos accesibles, A+ y alto contraste. Tablas en tarjetas móviles y áreas táctiles de 44 px. Paleta comprobada con contraste AA; pruebas responsive de 320–1440 px en la revisión visual. No es certificación WCAG.

Pruebas y build aprobados; clave ausente del código y del bundle verificados. Fixtures solo en dashboard.test.mjs; no se incluyen en el producto.

Consultar ../backend/README.md para la matriz de endpoints, evidencia de POST/GET, credenciales, fallos parciales y límites antes de producción. Los cambios son locales y no se hizo push.
