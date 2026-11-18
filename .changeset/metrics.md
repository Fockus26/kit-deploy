---
"kit-deploy": minor
---

Métricas de CPU, memoria, peticiones y errores 5xx por proyecto y del servidor. `kit-deploy metrics <proyecto>` muestra la última lectura de cada contenedor frente a su límite y las peticiones y 5xx de las últimas 24 h; `kit-deploy-metrics.timer` las recoge cada 30 s (filas de 1 minuto por 48 h, de 1 hora por 30 días).
