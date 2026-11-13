---
"kit-deploy": minor
---

Cada deploy publica el estado del commit en GitHub (`kit-deploy/production`): success con la URL del sitio o failure con el motivo. El token de la plataforma se instala con `install.sh --github-token` (stdin, `/etc/kit-deploy/github.env` root 0600).
