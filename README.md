# Mauricio_ERPNext

Cliente local y agnóstico para administrar instancias ERPNext desde el navegador.

## Alcance

La SPA se conecta directamente a ERPNext mediante REST; no existe backend propio ni se almacenan datos en el servidor de este proyecto. La conexión se configura en el navegador por perfil. Las credenciales se cifran con Web Crypto y la sesión local dura temporalmente para sobrevivir a refreshes.

Incluye:

- Productos `Item` con caché local, búsqueda explícita y edición en página separada.
- DocTypes con catálogo cacheado y actualización manual.
- Vista **Variantes** con jerarquía de plantillas y variantes usando `variant_of`.
- Creación y edición de productos/variantes desde la jerarquía.
- Vista **Múltiples UOM** para detectar presentaciones como `Kg`, `Bulto` o `Caja`, mostrando sus factores de conversión.

## Caché y ERPNext

Los catálogos se guardan en IndexedDB por perfil de conexión y no se vuelven a descargar al navegar entre vistas. Usa los botones de refresco cuando necesites sincronizar cambios externos.

La lectura de UOM intenta consultar `UOM Conversion Detail` en una sola carga paginada. Si el usuario no tiene permiso sobre ese child DocType, la aplicación usa las filas `uoms` incluidas en cada documento `Item` como fallback. Esto evita exigir permisos adicionales solo para visualizar presentaciones.

## Desarrollo

```bash
npm install
npm run dev
```

La aplicación no tiene backend propio. Cada usuario configura la URL de su instancia,
API Key y API Secret desde el navegador. Las credenciales se cifran con Web Crypto
antes de guardarse localmente y nunca se incluyen en el bundle.

## Verificación

```bash
npm run build
npm test
```

La instancia ERPNext debe permitir CORS desde el dominio donde se despliega la SPA.
En producción se aceptan URLs HTTPS; HTTP queda limitado a `localhost` para desarrollo.

## Rutas principales

- `/items`: catálogo local de productos.
- `/variants`: jerarquía de plantillas, variantes y múltiples UOM.
- `/doctypes`: explorador de DocTypes cacheado.
- `/settings`: prueba y bloqueo de la conexión local.

No incluyas API keys, API secrets, contraseñas locales ni respuestas reales de ERPNext en commits, capturas o issues.

