# QA funcional — tanda 2026-11-18 (eliminar passkey · nuevo proyecto con selector de repo · selects · Auditoría) — 2026-11-18

**Código:** main @ 599afcc (slot `kit-deploy-wt/wt1`)
**Entorno:** http://localhost:4301 · `bun run qa:local -- --port 4301 --preview` (build de producción, Postgres en Docker, base `qa_4301`). Cuenta EMAIL_TEST dada de alta por el flujo real `/enrol` (passkey con el autenticador virtual WebAuthn de Chromium por CDP + TOTP calculado en el script, sin imprimir el secreto); sesión por `/login` con email + código TOTP. Proyectos y despliegues de demo con `qa-session.ts --demo` + `qa-seed.ts`. Se pudo probar: eliminar passkey (completo), Nuevo proyecto por la ruta sin token (campo de texto + pista fila 44), selects de Nuevo proyecto / Nuevo token / Despliegues, paginación de Auditoría. No se pudo: el combobox de repos (ver «No verificado»).
**Resultado:** 0 críticos · 1 alto · 4 medios · 4 bajos

## Resumen
Nada crítico: eliminar passkey resiste bien los ataques (IDOR con el id de otra cuenta, ids basura, códigos de 5/7 dígitos, no numéricos o de ancho completo forzados en el DOM, código reutilizado, doble clic, Enter ×3, dos pestañas, sesión caducada, cuenta sin TOTP, bloqueo tras 5 códigos malos incluso con el código bueno, fila de auditoría y la línea de fail2ban). **Lo que no debe llegar a producción tal cual es el Alto:** en un formulario con Server Action, el select vuelve a su primer valor tras un envío rechazado, así que un proyecto se crea con 512 MB aunque se eligieran 1024 y un token puede salir para otro proyecto, sin avisar. Los Medios: no hay confirmación ni foco tras eliminar una passkey, nombres `www`/`deploy`/`tienda_` rechazados con un mensaje genérico, un fallo de red tumba la página entera y se pierde lo escrito, y el mismo repo con otras mayúsculas se acepta dos veces.

## Hallazgos

### [Alto] Un select dentro de un formulario con Server Action vuelve a su primer valor tras un envío rechazado: el proyecto se crea con 512 MB y el token sale para otro proyecto
- **Flujo:** Nuevo proyecto › Memoria; Ajustes › Nuevo token › Proyecto (mismo componente `OptionSelect`).
- **Pasos (Nuevo proyecto):**
  1. Entrar a `/new`.
  2. Nombre `Mayusculas` (inválido: mayúsculas), Repositorio `qa/x`, Memoria **1024 MB**.
  3. Pulsar «Crear proyecto» → aviso «Revisa los campos marcados.» y error en Nombre. Nombre y Repositorio conservan lo escrito; **Memoria muestra ahora «512 MB»**.
  4. Corregir el nombre a `x_ok` y pulsar «Crear proyecto».
- **Pasos (Nuevo token):** en `/settings` › Nuevo token, elegir Proyecto `maranatha`, mandar una etiqueta rechazada (101 caracteres, quitando el `maxlength` del navegador; cualquier rechazo del servidor sirve) → el select vuelve a `b1` (el primero) → corregir la etiqueta y crear → el token es de `b1`.
- **Esperado:** el valor elegido sobrevive al error, como el resto de campos (el formulario es controlado justo para eso).
- **Ocurre:** `projects.memory_mb = 512` (elegido 1024); `deploy_tokens` del token nuevo apunta a `b1` (elegido `maranatha`). Nada avisa: el select muestra el valor inicial y el usuario no suele volver a mirarlo.
- **Evidencia:** repro `FAIL memoria: shown-after-error="512 MB" saved=512MB (chosen 1024); token: minted for "b1" (chosen maranatha)`.
- **Causa:** React hace `form.reset()` al terminar la acción de `<form action>`; Radix Select (v2.4.1, `node_modules/@radix-ui/react-select/dist/index.mjs:96-103`) escucha el `reset` del formulario y llama `setValue(initialValueRef.current)`, que en modo controlado dispara `onValueChange("512")` / `onValueChange(projects[0])` y pisa el estado. Los `<input>` controlados no sufren esto; el select sí.
- **Impacto:** un proyecto con menos memoria de la elegida (OOM en producción sin saber por qué); un token de despliegue pegado en el repo equivocado. El rechazo previo es realista en Nuevo proyecto (nombre con mayúscula, nombre repetido).
- **Dónde mirar:** `components/kit/option-select.tsx` (no reenviar al padre un `onValueChange` causado por el reset, o no pasar `name` a Radix y llevar el valor en un `<input type="hidden">` propio, como hace `repo-combobox.tsx`); usos con Server Action: `app/(panel)/new/new-project-form.tsx:262`, `app/(panel)/settings/token-controls.tsx:148`. Los filtros de Despliegues (sin `<form>`) no lo sufren.
- **Para:** frontend-build
- **Reproducible:** siempre — `.qa/repro/2-select-vuelve-al-inicial.mjs`

### [Medio] Tras eliminar una passkey no aparece el aviso «Passkey … eliminada» y el foco cae en `<body>`
- **Flujo:** Ajustes › Passkeys › Eliminar.
- **Pasos:**
  1. Cuenta con 2+ passkeys y TOTP. `/settings` › «Eliminar» en una fila.
  2. Escribir el código vigente de la app y pulsar «Eliminar passkey».
- **Esperado:** el diálogo se cierra, el `<output>` encima de la tabla dice «Passkey «…» eliminada. Ese dispositivo ya no puede entrar al panel.» y recibe el foco (así lo dice `tables.tsx`).
- **Ocurre:** la fila desaparece y el diálogo se cierra, pero no hay ningún aviso y `document.activeElement` es `BODY` (muestreado a 0,1 / 0,5 / 1,5 / 4 s). Igual en la segunda pestaña que llega tarde: no se ve «Esa passkey ya no estaba en tu cuenta.». El aviso sí sale cuando la fila no se borra (id de otra cuenta), lo que delata la causa.
- **Causa probable:** la respuesta de la acción trae el RSC revalidado (`revalidatePath("/settings")`), la fila se desmonta con su `AlertDialog` en el mismo commit y `onCloseAutoFocus` (donde se llama a `onRemoved`) nunca corre.
- **Impacto:** acción destructiva sin confirmación; con lector de pantalla no se anuncia nada y el foco se pierde (WCAG 2.4.3 / 4.1.3).
- **Dónde mirar:** `app/(panel)/settings/passkey-controls.tsx:68-75` (`onCloseAutoFocus`), `tables.tsx:56-62`. Llamar a `onRemoved` desde `onDone` (antes del cierre) en vez de desde `onCloseAutoFocus`.
- **Para:** frontend-build
- **Reproducible:** siempre (4/4: doble clic, Enter ×3, dos pestañas, una sola eliminación) — `.qa/repro/1-aviso-passkey-eliminada.mjs` (inserta una passkey falsa por SQL; ojo: si la cuenta quedó bloqueada por 5 códigos malos en los últimos 15 min, sale `FAIL … (dialog: Demasiados…)`, que no es este fallo)

### [Medio] Nombres `www`, `db`, `deploy`, `preview` o terminados en `_` se rechazan con «Revisa los datos del formulario.» sin decir qué campo ni por qué
- **Flujo:** Nuevo proyecto.
- **Pasos:** `/new` › Nombre `www` (o `deploy`, `db`, `preview`, `tienda_`), Repositorio `qa/a12` › «Crear proyecto».
- **Esperado:** error en el campo Nombre, del estilo de los otros reservados («Ese nombre está reservado: es un subdominio de la plataforma» / «No puede terminar en _»).
- **Ocurre:** solo el aviso genérico «Revisa los datos del formulario.» y ningún campo marcado. El esquema (`projectCreateSchema`) los acepta; los rechaza después `addProject` (`defaultHost` devuelve null) con un `CoreInputError` que `fromError` convierte en el genérico.
- **Impacto:** el usuario no sabe qué cambiar.
- **Dónde mirar:** `lib/panel/schemas.ts:189-198` (añadir un `refine` con `defaultHost(n) !== null`), `lib/core/target.ts:60-67`, `lib/ops/projects.ts:84-90`.
- **Para:** backend-build
- **Reproducible:** siempre

### [Medio] Si el POST de la acción falla (red caída, 500, sin conexión), la página entera cambia a «Algo falló en el panel» y se pierde lo escrito
- **Flujo:** Nuevo proyecto (y por el mismo mecanismo cualquier formulario con `useActionState`, incluido el diálogo de Eliminar passkey — este último no llegó a medirse).
- **Pasos:** `/new`, rellenar los tres campos; cortar el POST de la acción (Playwright `route.abort()`, `fulfill({status:500})` o `context.setOffline(true)`); pulsar «Crear proyecto».
- **Esperado:** un aviso en el formulario («No se pudo conectar con el panel. Inténtalo de nuevo.») con los datos intactos y el botón usable.
- **Ocurre:** en los tres casos el `error.tsx` del panel sustituye la página («Algo falló en el panel» + Reintentar); el formulario desaparece y lo escrito se pierde. Ningún proyecto se crea (correcto). No hay traza al usuario.
- **Causa:** una acción que rechaza dentro de `useActionState` lanza al error boundary más cercano; `step()` en `new-project-form.tsx:36-40` no captura el fallo de red.
- **Impacto:** conexión inestable (móvil) = volver a teclearlo todo; el mensaje no dice que fue la red.
- **Para:** frontend-build · **Reproducible:** siempre (`.qa/net-probe.mjs`)

### [Medio] El mismo repositorio con otras mayúsculas crea un segundo proyecto
- **Flujo:** Nuevo proyecto.
- **Pasos:** crear `p1` con repo `qa/mem-x`; crear `p2` con repo `QA/Mem-x`.
- **Esperado:** «Ya hay un proyecto … con el repo …» (GitHub no distingue mayúsculas en `owner/repo`).
- **Ocurre:** `p2` se crea, con su token. `projects.repo` es `unique` sensible a mayúsculas y `lib/api/deploy.ts:56` ya pasa el repo a minúsculas para la imagen: dos proyectos acaban apuntando a `ghcr.io/qa/mem-x`.
- **Impacto:** dos proyectos y dos tokens para un repo; despliegues cruzados o confusos. Poco frecuente (hay que teclearlo a mano; con el selector de D062 llega el nombre canónico).
- **Dónde mirar:** `lib/db/schema.ts:36` (índice único sobre `lower(repo)`) o normalizar en `projectCreateSchema`.
- **Para:** backend-build
- **Reproducible:** siempre

### [Bajo] Validaciones de Nuevo proyecto que dejan pasar valores que luego no sirven
- **Pasos / ocurre** (todos crean el proyecto):
  - Repo `owner/repo.git` (sufijo de la URL de clonado) → guardado tal cual; GitHub nunca enviará ese nombre.
  - Rama `refs/heads/main`, `feature/`, `main.lock`, `-rf` → guardadas; ninguna es un nombre de rama válido para git (`git check-ref-format --branch`). Solo se usa en el `rebuild` (`dispatchRebuild`), que fallará.
  - Nombre y repo con espacios alrededor (`  espacios  `, `  qa/spaces  `) → se recortan bien (correcto, solo para constancia).
- **Esperado:** rechazo en el campo, o normalizar `.git`.
- **Dónde mirar:** `lib/ops/rules.ts:25-28` (`REPO_RE`, `BRANCH_RE`).
- **Para:** backend-build · **Reproducible:** siempre

### [Bajo] Repo repetido: el error «Ya existe.» se marca en Nombre aunque el nombre esté libre
- **Pasos:** crear `dup_x` con el repo de otro proyecto. Aviso general correcto («Ya hay un proyecto llamado dup_x, con el repo … o con su dominio.»), pero el campo marcado es Nombre.
- **Dónde mirar:** `lib/panel/actions/projects.ts:65-70`. **Para:** backend-build · **Reproducible:** siempre

### [Bajo] Eliminar passkey: mensajes que no ayudan en tres casos
- **Sesión caducada a mitad del diálogo** (borrar la fila de `auth_session` con el diálogo abierto y enviar un código válido): sale «Tu sesión ha caducado. Vuelve a entrar para continuar.» sin enlace «Entrar», a diferencia de Nuevo proyecto (`new-project-form.tsx:146-158`). Nada se borra (correcto).
- **Código incorrecto:** solo se ve «El código no coincide.» bajo el campo; el texto largo con la pista de la hora del teléfono (`PASSKEY_COPY.wrongCode`) nunca se muestra porque `general` se anula cuando hay error de campo (`passkey-controls.tsx:139-141`).
- **Cuenta sin TOTP:** el botón «Eliminar» se ofrece y el diálogo dice «Después entrarás con tu app de autenticación…» aunque no la hay; solo al enviar llega «Tu cuenta no tiene app de autenticación…». Se rechaza bien en el servidor.
- **Para:** frontend-build · **Reproducible:** siempre

### [Bajo] Auditoría: `?pagina=9999999999` lleva a la página 1 y `?pagina=999` a la última
- Más de 9 dígitos no pasa `/^[0-9]{1,9}$/` y cae en 1; con menos, se recorta a la última. Inofensivo, solo incoherente. `lib/panel/data/resources.ts:286-289`. **Para:** backend-build

## No verificado
| Qué | Por qué no se pudo |
|---|---|
| Combobox de repos (D062: búsqueda, «Usar «…»», badge Privado, autocompletar la rama con la rama por defecto sin pisar una editada, teclado, lista truncada a 500) | `lib/github/repos.ts` usa `GITHUB_API` fijo (`lib/deploy/github.ts:10`, solo `opts.api` en tests); no hay variable de entorno para apuntarlo a un falso y el fetch es del servidor (Playwright no lo intercepta). Sin tocar código no se puede. Por lectura: elegir un repo de la lista (rama → su rama por defecto) y después uno libre con «Usar «…»» deja la rama del repo anterior (`onPick(free, null)` no la toca) — hipótesis, no medida. |
| Pista de error (fila 45, GitHub falla) | Necesitaría reiniciar el servidor con un `GITHUB_READ_TOKEN` falso, que mandaría ese token a api.github.com real; no lo hice. |
| Selects de Logs y de Dominios › «Ver los registros de» | Sin kit-agent local, Logs no pinta el formulario de filtros; en Dominios de maranatha (datos de demo) el select no aparece. |
| Dos usuarios reales | v1 permite una sola cuenta (`createUser` rechaza la segunda, D003). El IDOR se probó con una cuenta B y su passkey insertadas por SQL. |
| Fallo de red en el diálogo de passkey | El script no encontró la fila a tiempo; por el mecanismo debería comportarse como Nuevo proyecto (Medio de red). |
| Nombres con `__` (p. ej. `ab__cd` → `ab--cd.fockus.dev`) | Let's Encrypt rechaza etiquetas con `--` en las posiciones 3-4 si no son `xn--`; depende de si Caddy pide certificado por host o usa el comodín. No se puede medir en local. |

## Datos creados
Todo en la base local `qa_4301` (desechable; el siguiente `qa:local` la recrea): la cuenta EMAIL_TEST con 2 passkeys reales + TOTP (luego borradas en las pruebas), un usuario B y passkeys falsas por SQL, ~20 proyectos de prueba (`b1`, `r7`, `mem_*`, `dbl_*`…), tokens, 3 filas de auditoría con la misma marca de tiempo, demo de `qa-seed.ts`. Nada remoto. Secretos de la cuenta QA (TOTP, códigos de recuperación) en `wt1/.qa/secrets.json` (gitignored), nunca impresos.

## Acciones requeridas de César
1. **Decidir cómo se prueba el combobox de repos en QA**
   - Por qué: la ruta principal de D062 no es verificable en `qa:local`.
   - Pasos: aceptar (o no) una variable solo-QA tipo `GITHUB_API_BASE` que `qa-local.ts` apunte a un servidor falso local; lo implementaría backend-build, no QA.
   - Qué necesito de vuelta: sí/no; con sí, otra pasada de QA solo sobre el combobox.

## Camino feliz
- Alta `/enrol` (passkey + TOTP + códigos), segunda passkey con otro enlace, entrada con email + TOTP: bien.
- Ajustes › Passkeys › Eliminar con el código vigente: la fila se va, `audit_log` recibe `passkey.remove` (actor `web:<id>`, proyecto `-`, nombre), la tabla muestra «Cuenta». Eliminar la última muestra el aviso «Es tu única passkey» y después se entra con TOTP sin problema.
- Nuevo proyecto con nombre/repo/rama válidos: crea un proyecto y un token; vista del token una sola vez (se va al recargar y con «Ya lo guardé»; atrás/adelante no lo devuelven). Doble clic y Enter ×3 → 1 petición, 1 proyecto, 1 token. Teclado: Tab nombre → repo → rama → Memoria → Crear; el select se abre con Espacio/Enter/↓, flechas, Enter elige, Escape conserva el valor, búsqueda por tecleo.
- Despliegues › Estado: cambia `?status=`; valores basura → «Todos», sin errores.
- Auditoría: 20 filas por página, «Página N de M», `?pagina=0/-1/abc/1e1/2.5/<script>` → página 1, `999` → la última, 42 filas distintas en 3 páginas (las de la misma marca de tiempo no se repiten ni se pierden), «Siguiente» deja la sección a la vista.

## Feedback para el kit
| Tipo | Archivo | Clase | Regla que lo habría evitado |
|---|---|---|---|
| Prevención | reference/QA-PREVENTION.md | Select de Radix (shadcn) controlado dentro de `<form action>`: el `form.reset()` que hace React tras la acción lo devuelve al valor inicial y dispara `onValueChange` | Un select con `name` en un formulario con Server Action no debe reenviar el `onValueChange` del reset; prueba obligatoria: elegir un valor no inicial, provocar un error de servidor y comprobar el valor enviado en el segundo envío. |
| Prevención | reference/QA-PREVENTION.md | Aviso/foco tras una acción que borra la fila del propio disparador (el componente se desmonta con la revalidación antes del callback de cierre) | El aviso de éxito se fija desde el resultado de la acción, nunca desde `onCloseAutoFocus` del diálogo de una fila que va a desaparecer. |
| Prevención | reference/QA-PREVENTION.md | `useActionState` sin `try/catch` en el envío: un fallo de red tumba la ruta al error boundary y se pierde lo escrito | Envolver la llamada a la acción y devolver un fallo tipado «sin conexión» que el formulario muestra conservando los valores. |
| Kit | QA agent | Las comprobaciones de error por texto chocan con el texto de ayuda (p. ej. «6 dígitos» está en la ayuda y en el error) | Leer el error por su `id` (`aria-describedby` / `*-error`), no buscar el texto en todo el diálogo. |
