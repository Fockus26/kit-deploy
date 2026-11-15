---
"kit-deploy": minor
---

Cada proyecto tiene como máximo cuatro previews encendidas. Antes de levantar una quinta, kit-deploy duerme la que lleva más tiempo sin push: su contenedor se detiene, su URL muestra "Este preview está dormido" y el comentario del PR lo indica. El siguiente push a ese PR la despierta, y cerrar el PR también limpia una preview dormida. Producción no cuenta para el límite.
