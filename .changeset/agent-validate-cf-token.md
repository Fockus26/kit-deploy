---
"kit-deploy": patch
---

kit-agent pasa el token de Cloudflare a `caddy validate`: con el sitio de previews instalado, cada escritura de sitio o preview fallaba la validación y ningún deploy llegaba a publicarse.
