# D054 · Panel · Ícono propio, imagen para compartir y metadatos base; sigue `noindex` · Confirmed (2026-11-18)

**Decision:** el panel tiene `app/icon.svg`, `app/apple-icon.tsx`, `app/opengraph-image.tsx` y
`app/twitter-image.tsx` (convenciones de archivos de Next), `metadataBase` desde `DASHBOARD_HOST`,
`openGraph` (siteName, locale `es`), `twitter: summary_large_image` y `themeColor` claro/oscuro.
La marca es una flecha ascendente sobre una línea base (despliegue), en `primary` sobre
`background` del tema oscuro. `ImageResponse` no lee variables CSS: los valores viven en
`lib/brand.ts` y `tests/unit/brand.test.ts` comprueba que coinciden con `app/globals.css`.
`robots` y `X-Robots-Tag` siguen en noindex: es identidad, no posicionamiento.
**Why:** opción conservadora: ningún color de marca nuevo; un enlace compartido muestra una tarjeta
propia. **Alternativa descartada:** monograma "kd" con texto (depende de una fuente en
`ImageResponse`, más frágil y menos legible a 16 px). Se retiró `app/favicon.ico` (el de Next).
