# Mauricio_ERPNext

Cliente local y agnóstico para administrar instancias ERPNext desde el navegador.

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

