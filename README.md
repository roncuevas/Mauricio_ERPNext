<p align="center">
  <img src="./public/mauricio-logo-cropped.png" alt="Mauricio ERPNext" width="160" />
</p>

# Mauricio_ERPNext

Cliente local y agnóstico para administrar instancias ERPNext desde el navegador.

## Alcance

La SPA se conecta directamente a ERPNext mediante REST; no existe backend propio ni se almacenan datos en el servidor de este proyecto. La conexión se configura en el navegador por perfil. Las credenciales se cifran con Web Crypto y la sesión local dura temporalmente para sobrevivir a refreshes.

Incluye:

- Productos `Item` con caché local, búsqueda explícita y edición en página separada.
- DocTypes con catálogo cacheado y actualización manual.
- Vista **Variantes** con jerarquía de plantillas y variantes usando `variant_of`; inicia colapsada para evitar una lista extensa.
- Controles para expandir/colapsar cada rama o toda la jerarquía, con expansión automática de las ramas relevantes al buscar.
- Creación y edición de productos/variantes desde la jerarquía.
- Vista **Múltiples UOM** para detectar presentaciones como `Kg`, `Bulto` o `Caja`, mostrando sus factores de conversión.

## Caché y ERPNext

Los catálogos se guardan en IndexedDB por perfil de conexión y no se vuelven a descargar al navegar entre vistas. La jerarquía se renderiza desde esa caché; usa los botones de refresco cuando necesites sincronizar cambios externos.

La lectura de UOM intenta consultar `UOM Conversion Detail` en una sola carga paginada. Si el usuario no tiene permiso sobre ese child DocType, la aplicación usa las filas `uoms` incluidas en cada documento `Item` como fallback. Esto evita exigir permisos adicionales solo para visualizar presentaciones.

El editor por producto consulta el documento `Item` una sola vez para cargar sus UOM y conversiones. El catálogo de nombres del DocType `UOM` se guarda en IndexedDB separado por perfil, se reutiliza durante 24 horas y se sincroniza en páginas de 500 registros cuando caduca. Si la sincronización falla pero existe una copia local, se conserva esa copia para no bloquear el editor. Las claves de React Query también incluyen el perfil para evitar mezclar datos entre conexiones ERPNext.

## Desarrollo

```bash
npm install
npm run dev
npm run lint
```

La aplicación no tiene backend propio. Cada usuario configura la URL de su instancia,
API Key y API Secret desde el navegador. Las credenciales se cifran con Web Crypto
antes de guardarse localmente y nunca se incluyen en el bundle.

## Feature flags

Los flags se leen actualmente desde variables `VITE_FF_*` al construir la SPA. La
resolución está aislada en `src/lib/feature-flags.ts`, por lo que el proveedor puede
cambiar después a Firebase Remote Config, LaunchDarkly u otro servicio sin acoplar
los componentes a ese proveedor. Consulta `.env.example` para los nombres disponibles.

## Verificación

```bash
npm run lint
npm run i18n:lint && npm run i18n:status
npm run build
npm run check:bundle
npm test
npm run test:e2e
```

El workflow `.github/workflows/ci.yml` ejecuta estos mismos pasos, pero solo se lanza
manualmente desde la pestaña Actions de GitHub; no corre en cada push ni pull request.

La suite `npm run test:e2e` usa datos mockeados y valida navegación responsive en móvil
y escritorio. Para probar la integración real, `npm run test:e2e:erpnext` levanta un
ERPNext local desechable en Docker, borra sus volúmenes, crea fixtures funcionales por
REST y ejecuta la suite en móvil, tablet y escritorio. Requiere Docker, Node y un
Chrome local compatible con Playwright.

## E2E real con ERPNext

```bash
cp .env.erpnext.example .env.erpnext.local # opcional: los defaults son locales
npm run erpnext:up
npm run erpnext:health
npm run test:e2e:erpnext
```

`test:e2e:erpnext` hace reset automático del entorno local antes de sembrar los datos.
Los accesos API se generan después del seed y se guardan únicamente en el archivo
ignorado `.env.erpnext.local`. El stack usa la imagen oficial `frappe/erpnext` y queda
disponible en `http://127.0.0.1:8080`. Para destruirlo manualmente:

```bash
npm run erpnext:reset
```

El reset elimina solamente los volúmenes del proyecto Docker `mauricio-erpnext-e2e`.
No uses estos scripts contra una instancia remota o de producción.

La instancia ERPNext debe permitir CORS desde el dominio donde se despliega la SPA.
En producción se aceptan URLs HTTPS; HTTP queda limitado a `localhost` para desarrollo.

## Despliegue

`npm run build` genera archivos estáticos en `dist/`. Sirve esa carpeta desde cualquier
hosting estático con HTTPS y configura un fallback de rutas a `index.html`, porque la
SPA usa rutas del navegador (`/items`, `/pos`, etc.). Los feature flags `VITE_FF_*` se
fijan en el build; no hay variables de entorno en tiempo de ejecución.

## Rutas principales

- `/items`: catálogo local de productos.
- `/variants`: jerarquía de plantillas, variantes y múltiples UOM.
- `/prices`: precios de compra, venta y precios específicos por proveedor.
- `/suppliers`: catálogo de proveedores y alta de nuevos registros.
- `/doctypes`: explorador de DocTypes cacheado.
- `/settings`: prueba y bloqueo de la conexión local.

No incluyas API keys, API secrets, contraseñas locales ni respuestas reales de ERPNext en commits, capturas o issues.

Las cachés locales se mantienen en IndexedDB por perfil. Las ediciones exitosas pueden actualizar localmente una entidad, pero conservan la marca de cambios locales hasta que se ejecute un refresco completo del catálogo.

La jerarquía de variantes virtualiza sus raíces cuando la búsqueda produce más de 200 nodos; con catálogos pequeños conserva el render normal para mantener una interacción sencilla y accesible.


## Licencia

Este proyecto se distribuye bajo [CC BY-NC-SA 4.0](./LICENSE). Puedes usarlo, estudiarlo
y modificarlo sin fines comerciales, dando crédito al autor. Cualquier versión modificada
que compartas debe publicarse bajo la misma licencia. El uso comercial requiere permiso
explícito del autor.
