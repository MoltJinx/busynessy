# BusyNessy 💸📊

> ⚙️ **Rama histórica de backend.** Esta rama conserva una iteración anterior del API y la consola. La implementación de referencia, con seguridad, sincronización e integración actualizadas, vive en [`main`](https://github.com/MoltJinx/busynessy/tree/main).
> **Business, not messy.** Una brújula financiera para que las pequeñas empresas decidan con claridad.

[![Producto](https://img.shields.io/badge/producto-B2B-0f766e)](https://github.com/MoltJinx/busynessy)
[![Estado](https://img.shields.io/badge/estado-MVP%20funcional-f59e0b)](https://github.com/MoltJinx/busynessy)
[![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb)](Frontend/)
[![Backend](https://img.shields.io/badge/backend-Node.js-339933)](backend/)

Plataforma B2B para que empresas medianas entiendan sus movimientos, anticipen liquidez y reciban alertas financieras accionables.

## 🌱 La idea

Las pymes no suelen tener un equipo de tesorería dedicado. Sin embargo, cada día necesitan responder preguntas críticas: **¿cuánto dinero tengo?, ¿qué pagos vienen?, ¿puedo asumir un gasto nuevo?, ¿cuándo debo actuar?**

BusyNessy convierte movimientos bancarios en una lectura sencilla del presente y una proyección explicable de los próximos 30 días. No pretende reemplazar el criterio del negocio: lo fortalece con contexto, señales tempranas y acciones concretas.

## 🎯 Nuestra propuesta

- **Visibilidad:** ingresos, gastos, saldo y flujo neto en un solo panel.
- **Anticipación:** forecast diario de liquidez para detectar posibles déficits antes de que sean urgentes.
- **Control:** alertas sobre duplicados, cargos atípicos, comercios nuevos y obligaciones próximas.
- **Decisión:** metas de reserva y recomendaciones que conectan los datos con el siguiente paso.
- **Confianza:** análisis explicable, aislamiento por empresa y roles protegidos; una alerta es una señal para revisar, no una acusación de fraude.

## 👥 Para quién es

1. **Dueños y responsables financieros de pymes** que necesitan una vista rápida y accionable de su caja.
2. **Operadores y administradores** que registran cuentas, comercios y movimientos sin perder control de permisos.
3. **Equipos de innovación financiera** que quieren explorar inteligencia de capital de trabajo sobre datos bancarios de sandbox.

## ✨ Qué se puede hacer hoy

- Crear una empresa y provisionar una cuenta con Clerk, Supabase y Nessie.
- Consultar saldo e historial real del sandbox bancario.
- Ver ingresos, gastos, obligaciones, gastos recurrentes y flujo neto.
- Explorar un forecast de 30 días con saldo mínimo y riesgo de déficit.
- Revisar alertas, guardar una meta de reserva y marcar revisiones.
- Usar una consola administrativa protegida por rol para operar cuentas y movimientos.
- Trabajar con una interfaz responsive, alto contraste y texto grande.

## 🧭 Recorrido de la experiencia

```text
Clerk → onboarding de empresa → cuenta Nessie → sincronización Supabase
	→ dashboard → insights + forecast → alerta accionable → decisión de caja
```

## 📚 Documentación

- [Guía completa del producto y la arquitectura](README.md)
- [Frontend: instalación, pantallas y scripts](Frontend/README.md)
- [Backend: API, seguridad e integración con Nessie](backend/README.md)
- [Mapa de ramas y flujo de trabajo](docs/BRANCHES.md)

## Tutorial: ejecutar el proyecto localmente

### 1. Requisitos

- Node.js 22 LTS (Node.js 20.9 o superior también funciona).
- Una cuenta de Clerk para el acceso de usuarios.
- Un proyecto de Supabase con el esquema de BusyNessy.
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
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role_de_supabase
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

### Consola administrativa en una URL independiente

Con el backend activo, abre otra terminal dentro de `Frontend` y ejecuta:

```bash
npm run console
```

La consola queda en `http://127.0.0.1:5174/consola/`. Solo una sesión de Clerk con rol `admin` puede verla; los demás usuarios permanecen en su panel financiero.

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
| `backend/` | API Node.js: autenticación con Clerk, persistencia en Supabase, acceso a cuentas, movimientos, análisis y alertas. |

El navegador se comunica solo con el backend local. Clerk gestiona la identidad; Supabase persiste perfiles, empresas, cuentas, movimientos sincronizados, metas y revisiones. Las claves privadas permanecen en archivos `.env` ignorados por Git; no las subas al repositorio.

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
