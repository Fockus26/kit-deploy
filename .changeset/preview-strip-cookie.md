---
"kit-deploy": patch
---

Caddy le quita la cookie `kd_preview` a cada petición antes de pasarla a la app de una preview: la app de un PR ya no puede ver ni filtrar el token que abre todas las previews.
