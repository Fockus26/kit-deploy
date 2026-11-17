---
"kit-deploy": minor
---

`DATABASE_URL` llega sola a los contenedores de producción (base `<proyecto>`) y de las previews (`<proyecto>_preview`) desde `kit-db`, en cada arranque y sin guardarse en ningún sitio. Nuevo `kit-deploy db create <proyecto>` para crear las dos bases. Las variables de un proyecto solo entran en las imágenes de su repo fijado (`kit-deploy project pin`).
