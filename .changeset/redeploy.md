---
"kit-deploy": minor
---

Nuevo `kit-deploy redeploy <proyecto> [--pr <n>]`: vuelve a desplegar el commit en vivo con la misma imagen y las variables de ahora, sin build y sin cortar el servicio. El contenedor anterior queda para rollback. `env set` y `env rm` dicen cuándo hace falta.
