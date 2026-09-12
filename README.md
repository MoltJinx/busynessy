
## Tutorial: ejecutar el proyecto localmente

### 1. Requisitos

- Node.js 22 LTS (Node.js 20.9 o superior también funciona).
- Una cuenta de Clerk para el acceso de usuarios.
- Una clave de la API bancaria usada por el backend.

### 2. Clonar el repositorio

```bash
git clone https://github.com/MoltJinx/busynessy.git
cd busynessy
```

### 3. Configurar el backend

Instala las dependencias:

```bash
cd backend
npm install
```

Copia la plantilla de entorno y completa los valores privados:

```bash
copy .env.example .env.clerk
```

En macOS o Linux usa `cp .env.example .env.clerk`.

Edita `backend/.env.clerk` con estas variables:

```env
NESSIE_API_KEY=tu_clave_del_servicio
NESSIE_API_BASE_URL=https://prod-api.nessieisreal.com
CLERK_SECRET_KEY=tu_clave_secreta_de_clerk
CLERK_PUBLISHABLE_KEY=tu_clave_publica_de_clerk
```

Inicia el API:

```bash
npm run dev
```

El backend queda disponible en `http://127.0.0.1:8787`.

### 4. Configurar el frontend

En otra terminal:

```bash
cd Frontend
npm install
copy .env.example .env.local
```

En macOS o Linux usa `cp .env.example .env.local`.

Completa `Frontend/.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=tu_clave_publica_de_clerk
```

Inicia la aplicación:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Abre `http://127.0.0.1:5173` en el navegador.

### 5. Usar la aplicación

1. Selecciona **Crear una cuenta** e ingresa mediante Clerk.
2. Completa los datos de la empresa y su dirección.
3. La aplicación crea el cliente y sus cuentas mediante el backend.
4. Una vez creada, consulta el panel, movimientos, gastos, pronóstico y alertas.
5. Usa **Cerrar sesión** para terminar la sesión.

La consola administrativa se abre únicamente para usuarios cuyo rol de Clerk sea `admin`.

## Arquitectura

| Carpeta | Responsabilidad |
| --- | --- |
| `Frontend/` | Aplicación React/Vite, interfaz financiera y autenticación con Clerk. |
| `backend/` | API Node.js: autenticación, acceso a cuentas, movimientos, análisis y alertas. |

El navegador se comunica solo con el backend local. Las claves privadas permanecen en archivos `.env` ignorados por Git; no las subas al repositorio.

## Comprobaciones antes de entregar

```bash
# Frontend
cd Frontend
npm run build

# Backend
cd ../backend
node --check server.mjs
```

## Reto

**SMB Cash-Flow & Working Capital Intelligence (B2B Focus)**. BusyNessy transforma ingresos y gastos en una proyección de liquidez, alertas y recomendaciones para apoyar decisiones de capital de trabajo.
