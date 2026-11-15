---
"kit-deploy": minor
---

Cada preview avisa en GitHub: el commit recibe el status `kit-deploy/preview` (éxito con la URL de la preview, o fallo con el motivo) y el PR recibe un comentario con la URL, el commit corto y la nota de que pide login. Ese comentario se edita en su sitio con cada push y, al cerrar el PR, indica que la preview se eliminó. Si GitHub falla o no hay token, el deploy no cambia.
