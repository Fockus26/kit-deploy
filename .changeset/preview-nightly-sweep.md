---
"kit-deploy": minor
---

Cada noche, `kit-deploy preview sweep` limpia lo que las previews dejaron atrás: las de PRs ya cerrados en GitHub, los contenedores `pr-<n>` que ninguna preview usa y los archivos de Caddy sin preview. Con `--dry-run` muestra lo que haría sin tocar nada.
