---
"kit-deploy": minor
---

Nuevos comandos `kit-deploy env ls`, `env set` y `env rm` para las variables de cada proyecto por entorno (production, preview, development). El valor de `env set` se escribe sin eco o llega por una tubería, se guarda cifrado y, si es secreto, no se puede volver a leer. Cada cambio queda en el registro de auditoría, sin el valor.
