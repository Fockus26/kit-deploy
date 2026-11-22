# kit-deploy

## 0.3.0

### Minor Changes

- ab876fe: Panel: estructura base con barra lateral, cabecera y selector de tema. La barra lateral lista los proyectos, Nuevo proyecto y Ajustes; en el móvil se abre como panel. El tema arranca en oscuro (también en el inicio de sesión) y se puede cambiar a claro o al del sistema. Cada proyecto tiene sus pestañas (Resumen, Despliegues, Previews, Variables, Dominios, Logs, Bases; Cron llega en la fase 06).
- a7d25d3: Nuevo comando `kit-deploy project rm` para quitar un proyecto de la plataforma (las bases de datos se conservan).
- 9bfee30: Panel: Inicio, resumen del proyecto y despliegues.
- 71ac27d: Cada noche, `kit-deploy preview sweep` limpia lo que las previews dejaron atrás: las de PRs ya cerrados en GitHub, los contenedores `pr-<n>` que ninguna preview usa y los archivos de Caddy sin preview. Con `--dry-run` muestra lo que haría sin tocar nada.
- 1178451: Cada proyecto tiene como máximo cuatro previews encendidas. Antes de levantar una quinta, kit-deploy duerme la que lleva más tiempo sin push: su contenedor se detiene, su URL muestra "Este preview está dormido" y el comentario del PR lo indica. El siguiente push a ese PR la despierta, y cerrar el PR también limpia una preview dormida. Producción no cuenta para el límite.
- 91ec1a3: Ahora puedes eliminar una passkey desde Ajustes, confirmando con tu código TOTP.
- d1ef8c5: La plantilla `deploy-vps.yml` ahora crea una preview por cada PR (al abrirlo, con cada push y al reabrirlo) y la borra al cerrarlo. Los PRs de forks y de Dependabot se saltan con un aviso.
- 212687e: Puedes eliminar un proyecto desde el panel escribiendo su nombre y el código de tu app de autenticación; sus bases de datos se conservan.
- 7554d09: Logs de cada contenedor guardados 14 días; `kit-deploy logs` para verlos y buscarlos.
- b84d08f: Bases de datos: tamaño y último backup de cada base del proyecto (`kit-deploy db status`).
- 2b683db: `DATABASE_URL` llega sola a los contenedores de producción (base `<proyecto>`) y de las previews (`<proyecto>_preview`) desde `kit-db`, en cada arranque y sin guardarse en ningún sitio. Nuevo `kit-deploy db create <proyecto>` para crear las dos bases. Las variables de un proyecto solo entran en las imágenes de su repo fijado (`kit-deploy project pin`).
- 4f3a83c: Dominios: estado de DNS y certificado, redirección www, `domain ls` y `domain rm`.
- be528ac: Panel: lectura de datos y acciones (variables, despliegues, dominios, bases, proyectos) con las mismas reglas que el CLI.
- 87eac2c: Cron por proyecto: una ruta de producción llamada con su `CRON_SECRET` según un horario (UTC), con el registro de cada ejecución. `kit-deploy cron ls|add|rm|pause|resume|run|runs`; lo ejecuta `kit-deploy-cron.timer` cada minuto.
- 599afcc: Nuevo proyecto: el campo Repositorio busca entre tus repos de GitHub (con un token de solo lectura); sin el token se sigue escribiendo owner/repo.
- c4943ab: Previews por PR en la API: `POST /api/v1/deploy` acepta `{ sha, pr }` y levanta la preview del PR en su propio contenedor de 384 MB, publicada con `preview.write`; un push nuevo al mismo PR reemplaza su contenedor. `DELETE /api/v1/preview` con `{ pr }` borra el archivo de Caddy y los contenedores del PR cerrado. Producción no cambia.
- f4e86cf: Panel: componentes base (estados, medidores, tablas, diálogos, visor de logs).
- f640b62: La plantilla `deploy-vps.yml` no despliega hasta que el repo tenga `KIT_DEPLOY_ENABLED=true` (antes solo avisa, sin fallar), y `templates/MIGRATING.md` explica cómo pasar un proyecto de Vercel a kit-deploy.
- ebc7274: Limpieza nocturna de imágenes: se guardan las 5 más recientes de cada proyecto y las que usa algún contenedor (`kit-deploy images prune`, cada noche a las 04:45).
- 6348e88: Cada preview recibe su propia URL en `KIT_DEPLOY_PREVIEW_URL` (como `VERCEL_BRANCH_URL`), para que una app con login la acepte como origen. Nadie puede definir esa variable a mano.
- 58ce516: El build de cada proyecto recibe sus variables `NEXT_PUBLIC_*` del entorno (producción o preview) y una clave de Server Actions estable, con lo que un cambio de una variable pública llega a la web en el siguiente build. Los secretos siguen sin salir nunca hacia GitHub Actions. Hay que copiar la plantilla nueva `deploy-vps.yml` y el `Dockerfile` en cada proyecto.
- 0d1b6ff: Nuevo `kit-deploy rebuild <proyecto>`: vuelve a construir producción con los valores actuales de sus `NEXT_PUBLIC_*` y la despliega sin cortar el servicio. Necesita el permiso Actions: Read and write en el token de GitHub de la plataforma y la plantilla nueva `deploy-vps.yml` en el proyecto.
- 6272f55: Ajustes: puedes ver tus códigos de recuperación o generar nuevos confirmando con el código de tu app de autenticación.
- df3eb20: Panel: logs con búsqueda y seguimiento, y bases de datos.
- 227e43a: Nuevos comandos `kit-deploy env ls`, `env set` y `env rm` para las variables de cada proyecto por entorno (production, preview, development). El valor de `env set` se escribe sin eco o llega por una tubería, se guarda cifrado y, si es secreto, no se puede volver a leer. Cada cambio queda en el registro de auditoría, sin el valor.
- ffd9b45: Alertas por correo (Brevo): sitio caído y recuperado, certificado a menos de 14 días (incluido db.fockus.dev), disco por encima del 80 %, memoria justa, backup fallido y despliegue de producción fallido. Un correo por incidente al abrirse y otro al resolverse, agrupados por minuto; `kit-deploy alerts setup|test|ls|check`.
- 6c08db2: Panel: variables, dominios y previews.
- cfc75c8: Nuevo `kit-deploy env pull <proyecto> > .env.local`: escribe las variables de Development (también las secretas) en un archivo que Next.js lee tal cual, sin mostrarlas nunca en la terminal.
- 3e1015e: Panel: nuevo proyecto, ajustes y acceso con el estilo del panel.
- b57023c: Nuevo `kit-deploy redeploy <proyecto> [--pr <n>]`: vuelve a desplegar el commit en vivo con la misma imagen y las variables de ahora, sin build y sin cortar el servicio. El contenedor anterior queda para rollback. `env set` y `env rm` dicen cuándo hace falta.
- fac43e3: Cada preview avisa en GitHub: el commit recibe el status `kit-deploy/preview` (éxito con la URL de la preview, o fallo con el motivo) y el PR recibe un comentario con la URL, el commit corto y la nota de que pide login. Ese comentario se edita en su sitio con cada push y, al cerrar el PR, indica que la preview se eliminó. Si GitHub falla o no hay token, el deploy no cambia.
- 87a3746: Métricas de CPU, memoria, peticiones y errores 5xx por proyecto y del servidor. `kit-deploy metrics <proyecto>` muestra la última lectura de cada contenedor frente a su límite y las peticiones y 5xx de las últimas 24 h; `kit-deploy-metrics.timer` las recoge cada 30 s (filas de 1 minuto por 48 h, de 1 hora por 30 días).
- b5c1c45: Panel: pestaña Cron con las tareas programadas y sus ejecuciones, alertas abiertas en Inicio y la tarjeta Alertas de Ajustes con las últimas alertas y el último correo enviado.

### Patch Changes

- 92fbf71: Caddy le quita la cookie `kd_preview` a cada petición antes de pasarla a la app de una preview: la app de un PR ya no puede ver ni filtrar el token que abre todas las previews.
- 4b8d01e: Los selectores del panel usan un menú propio en lugar del nativo del navegador.
- 189125c: Panel: mensajes de error más claros, auditoría de las acciones y sin avisos de renderizado.
- 270208f: kit-agent pasa el token de Cloudflare a `caddy validate`: con el sitio de previews instalado, cada escritura de sitio o preview fallaba la validación y ningún deploy llegaba a publicarse.
- ad818ab: Panel: las páginas aprovechan el ancho en laptop y Auditoría pagina de 20 en 20 con Anterior/Siguiente.
- e6069aa: Panel: los selects conservan lo elegido cuando el servidor rechaza el formulario (antes el token podía salir para otro proyecto).
- 2b283c4: Panel: Nuevo proyecto y Nuevo token aprovechan el ancho en laptop.
- 53771f4: Panel: pantallas de error y carga, y ajustes de responsive y accesibilidad.
- 0ca3ee3: Los formularios y Server Actions de un sitio ya no reciben un 502 esporádico: Caddy cierra las conexiones inactivas con la app antes de que Node las cierre.
- 5c36b94: Seguridad: un sitio parado sigue parado y los proyectos no pueden tomar bases ajenas.
- fb04234: Nuevo proyecto: Tab sale del selector de Repositorio abierto y pasa al campo siguiente.
- 7c5e889: Panel: las tablas ya no parten palabras en el móvil y los avisos no desbordan con la fuente del navegador grande.
- 25b03f3: Nuevo proyecto: usar un repo escrito a mano ya no arrastra la rama del repo elegido antes.
- 69fd995: Pestañas del proyecto sin barra vertical, tarjetas del resumen a la misma altura y una tabla de variables más legible.
- 29de6a7: Las variables que configuran el runtime en vez de la app (`PATH`, `NODE_*`, `LD_*`, `*_PROXY`, `SSL_CERT_*`, `OPENSSL_*`, `UV_*`, `BUN_*`) ya no se pueden fijar: podían desviar el tráfico de un sitio y exponer sus secretos.
- f2209d9: El panel tiene ícono propio e imagen para compartir enlaces.

## 0.2.0

### Minor Changes

- 87be67c: `deploy.fockus.dev` ya tiene sus páginas de acceso: `/enrol` te guía para registrar la passkey, añadir la app de autenticación y guardar los 10 códigos de recuperación, y `/login` entra con la passkey o, como respaldo, con tu email y un código. Sin sesión, el panel te lleva a `/login`.
- ddeddee: El dashboard tiene su autenticación: passkey, TOTP y códigos de recuperación, sin registro público. `kit-deploy user create <email>` crea la cuenta e imprime un enlace de enrolamiento de un solo uso (15 minutos) en tu terminal.
- aea0ee6: Cada deploy publica el estado del commit en GitHub (`kit-deploy/production`): success con la URL del sitio o failure con el motivo. El token de la plataforma se instala con `install.sh --github-token` (stdin, `/etc/kit-deploy/github.env` root 0600).

### Patch Changes

- 7112799: Un enlace de alta que llega cortado al navegador ahora lo dice ("El enlace llegó incompleto") y sigue sirviendo si lo pegas entero; `kit-deploy user enrol` lo imprime en una sola línea. Si ya tienes la app de autenticación, un enlace nuevo solo añade una passkey y no cambia tus códigos.
