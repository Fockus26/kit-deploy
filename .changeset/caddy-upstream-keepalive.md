---
"kit-deploy": patch
---

Los formularios y Server Actions de un sitio ya no reciben un 502 esporádico: Caddy cierra las conexiones inactivas con la app antes de que Node las cierre.
