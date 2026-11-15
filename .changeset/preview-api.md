---
"kit-deploy": minor
---

Previews por PR en la API: `POST /api/v1/deploy` acepta `{ sha, pr }` y levanta la preview del PR en su propio contenedor de 384 MB, publicada con `preview.write`; un push nuevo al mismo PR reemplaza su contenedor. `DELETE /api/v1/preview` con `{ pr }` borra el archivo de Caddy y los contenedores del PR cerrado. Producción no cambia.
