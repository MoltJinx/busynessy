# Ramas de BusyNessy 🌿

Este documento evita que una rama parezca una segunda fuente de verdad por accidente.

## 🏠 `main`

Es la rama integrada y recomendada para revisar el producto completo. Contiene el frontend activo, el backend, las pruebas y la documentación principal. Los cambios que representen una funcionalidad lista para enseñar deben terminar aquí.

## 🧩 `frontend`

Rama histórica de trabajo de la interfaz. Puede servir para comparar decisiones visuales o recuperar una idea, pero no refleja necesariamente la integración actual con Clerk, Nessie y el backend.

## ⚙️ `backend`

Rama histórica de desarrollo del API y la consola. La implementación de referencia vive actualmente en `main`; antes de reutilizar commits hay que comprobar sus contratos y variables de entorno.

## 🧪 `middleware`

Rama experimental asociada a notas de seguridad y middleware. No es una línea de despliegue ni una alternativa funcional a `main`.

## 💻 `local-frontend`

Rama local auxiliar que apunta a la línea histórica del frontend. No debe usarse como rama de integración compartida.

## 🔁 Flujo recomendado

1. Crear una rama corta desde `main` para cada cambio.
2. Actualizar el README del área si cambia un contrato, script o flujo de usuario.
3. Ejecutar las pruebas del área y el build del frontend.
4. Abrir un pull request hacia `main`.
5. Mantener las ramas históricas como referencia, sin presentar su estado como el producto actual.