# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [0.1.0] - 2026-10-28

Primera versión pública.

### Conexión y seguridad

- Cliente REST para ERPNext sin backend propio; cada perfil guarda URL, API Key y
  API Secret cifrados con Web Crypto en el navegador.
- Sesión local cifrada que sobrevive a refreshes durante 8 horas y bloqueo manual.
- Importación de perfiles mediante enlaces compartidos que se eliminan de la URL.

### Catálogo

- Productos (`Item`) con caché local en IndexedDB por perfil, búsqueda difusa,
  tabla configurable, vista de cards y edición en páginas dedicadas.
- Jerarquía de plantillas y variantes (`variant_of`), colapsada por defecto, con
  expansión individual, global y guiada por búsqueda.
- Vista de múltiples UOM y editor de conversiones por producto, con fallback al
  documento `Item` cuando `UOM Conversion Detail` responde 403.
- Precios de compra y venta por producto, listas de precios, precios por cliente
  o proveedor y márgenes aproximados.
- Proveedores, inventario con reconciliación de stock y explorador de DocTypes
  con editor basado en metadatos.

### Ventas

- POS con apertura y cierre de turnos, cobro, devoluciones, ventas retenidas,
  impuestos y carritos locales persistentes.
- Sales Orders y cotizaciones con impuestos desde plantillas (detrás del feature
  flag `VITE_FF_QUOTATIONS_VIEW`).

### Experiencia

- Inicio operativo, búsqueda global, navegación agrupada responsive para móvil,
  tablet y escritorio, modo oscuro y preferencias locales.
- Interfaz en español e inglés.
- Gestión de cachés con refresco explícito y estado del último fetch.

[0.1.0]: https://github.com/roncuevas/Mauricio_ERPNext/releases/tag/v0.1.0
