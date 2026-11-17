---
"kit-deploy": minor
---

El build de cada proyecto recibe sus variables `NEXT_PUBLIC_*` del entorno (producción o preview) y una clave de Server Actions estable, con lo que un cambio de una variable pública llega a la web en el siguiente build. Los secretos siguen sin salir nunca hacia GitHub Actions. Hay que copiar la plantilla nueva `deploy-vps.yml` y el `Dockerfile` en cada proyecto.
