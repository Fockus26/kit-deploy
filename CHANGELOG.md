# kit-deploy

## 0.2.0

### Minor Changes

- 87be67c: `deploy.fockus.dev` ya tiene sus páginas de acceso: `/enrol` te guía para registrar la passkey, añadir la app de autenticación y guardar los 10 códigos de recuperación, y `/login` entra con la passkey o, como respaldo, con tu email y un código. Sin sesión, el panel te lleva a `/login`.
- ddeddee: El dashboard tiene su autenticación: passkey, TOTP y códigos de recuperación, sin registro público. `kit-deploy user create <email>` crea la cuenta e imprime un enlace de enrolamiento de un solo uso (15 minutos) en tu terminal.
- aea0ee6: Cada deploy publica el estado del commit en GitHub (`kit-deploy/production`): success con la URL del sitio o failure con el motivo. El token de la plataforma se instala con `install.sh --github-token` (stdin, `/etc/kit-deploy/github.env` root 0600).

### Patch Changes

- 7112799: Un enlace de alta que llega cortado al navegador ahora lo dice ("El enlace llegó incompleto") y sigue sirviendo si lo pegas entero; `kit-deploy user enrol` lo imprime en una sola línea. Si ya tienes la app de autenticación, un enlace nuevo solo añade una passkey y no cambia tus códigos.
