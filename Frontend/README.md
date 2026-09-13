# BusyNessy Frontend 🖥️

El frontend es la experiencia de BusyNessy: un panel financiero para que una pyme entienda su caja actual, anticipe los próximos 30 días y convierta alertas en decisiones.

## ✨ Experiencia principal

- **Resumen:** saldo, ingresos, gastos y flujo neto.
- **Movimientos:** búsqueda, filtros y detalle del historial.
- **Gastos:** cargos recurrentes y presión operativa.
- **Pronóstico:** proyección diaria, saldo mínimo y posible déficit.
- **Salud financiera:** lectura rápida de la situación del negocio.
- **Seguridad y alertas:** duplicados, cargos inusuales y comercios nuevos para revisar.
- **Ajustes:** meta de reserva, texto grande y alto contraste.

El onboarding conecta la identidad de Clerk con una empresa y una cuenta de Nessie. El navegador solo consume `/api`; las claves privadas permanecen en el backend.

## 🧱 Tecnologías

- React 19 + Vite ⚛️
- Clerk React para autenticación 🔐
- React Compiler mediante Babel ⚡
- Proxy local `/api` hacia `http://127.0.0.1:8787`
- CSS propio responsive, con soporte para accesibilidad

## 🚀 Ejecutar localmente

Requiere Node.js 22 LTS (Node.js 20.9 o superior también funciona).

```bash
npm install
copy .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173
```

En macOS o Linux, sustituye `copy` por `cp`.

Completa `Frontend/.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=tu_clave_publica_de_clerk
```

El backend debe estar activo en `http://127.0.0.1:8787`. Consulta la [guía del backend](../backend/README.md) para configurarlo.

## 🛠️ Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo del dashboard. |
| `npm run console` | Consola administrativa en `http://127.0.0.1:5174/consola/`. |
| `npm run build` | Compilación de producción. |
| `node dashboard.test.mjs` | Comprobaciones del dashboard. |

La consola está disponible únicamente para sesiones de Clerk cuyo `publicMetadata.role` sea `admin`.

## 🗂️ Puntos de entrada

- `src/App.jsx`: autenticación, onboarding y composición de vistas.
- `src/Dashboard.jsx`: panel financiero principal.
- `src/Console.jsx`: operaciones administrativas.
- `src/api.js`: cliente HTTP del backend.
- `src/components.jsx`: piezas visuales compartidas.

> ℹ️ `src/components/` contiene componentes de una iteración anterior. La aplicación activa importa los módulos del nivel superior de `src/`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
