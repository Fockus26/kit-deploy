# QA funcional — Nuevo proyecto (/new) con el combobox de repos de GitHub — 2026-11-19

**Entorno:** `bun run qa:local -- --port 4301` (Postgres en Docker `qa-kit-deploy-pg`, base `qa_4301`, modo dev) en el slot `kit-deploy-wt/wt1` (rama `qa/combobox-fake` = main 25b03f3), con `GITHUB_API_BASE=http://127.0.0.1:4310 GITHUB_READ_TOKEN=github_pat_qafake` y el GitHub falso `scripts/qa/github-fake.mjs --port 4310` (D065). Sesión con `scripts/qa-session.ts` (cuenta `EMAIL_TEST`). Playwright (chromium headless) con `node`, scripts en `.qa/`. Nunca contra la base real.
Se probó: búsqueda (mayúsculas, acentos, `/`, espacios, 250 caracteres, sin coincidencias, unicode, `<script>`), teclado completo, elegir/editar/cambiar de repo, formatos inválidos y manipulación del valor oculto contra el servidor, doble envío, proyecto creado en BD, recarga/atrás, 390 y 1440 px, `--fail 401/403/404/429/502`, falso apagado, `--slow 5200`, `--slow 4500 --count 600`, `--count 0`, fugas del token (HTML, RSC, respuestas, logs) y la puerta `QA_LOCAL` por lectura. No se probó en `--preview` (build de producción).
**Resultado:** 0 críticos · 0 altos · 2 medios · 5 bajos

## Resumen
Nada bloquea producción. Lo que importa de verdad está bien: el servidor revalida el repo y la rama (`REPO_RE`, `BRANCH_RE`, límite 201) sea cual sea lo que mande el cliente — `../../etc/passwd`, `a/b/c`, `<script>`, unicode, espacios, inyección SQL, 250 caracteres y ramas manipuladas se rechazan en su campo; un repo fuera de la lista pero válido se acepta (es lo diseñado, D062). El token falso no aparece en el HTML, en las 35 respuestas que recibe el navegador (incluida la navegación RSC), ni en los logs; sin sesión `/new` responde 307 a `/login` sin la lista. Todos los fallos de GitHub caen al campo de texto en ≤5,5 s sin romper la página. Los dos medios: **Tab no sale del selector abierto** (teclado) y **un token caducado (401/403) se muestra igual que GitHub caído y no deja rastro en el log**.

## Hallazgos

### [Medio] Con el selector de Repositorio abierto, Tab no sale: el foco se queda en «Busca owner/repo» y la lista sigue abierta
- **Flujo:** Nuevo proyecto › Repositorio, solo teclado.
- **Pasos:**
  1. `/new` con sesión; Tab desde Nombre hasta «Repositorio» y Enter (se abre, el foco va a la búsqueda).
  2. Pulsar Tab (o Tab ×4).
- **Esperado:** como en un select nativo o un combobox APG: Tab cierra la lista (sin cambiar el valor, o confirmando el resaltado) y el foco pasa a «Rama de producción».
- **Ocurre:** el foco no se mueve de la búsqueda tras 4 Tab seguidos, `aria-expanded` sigue `true`. Solo Esc (o clic fuera) libera. Shift+Tab sí sale y cierra. Igual en las 3 ejecuciones.
- **Evidencia:** `.qa/p6-leak-tab.mjs` → `tabSeq: ["input[Busca owner/repo] expanded=true" ×4]`; repro → `FAIL tab→focus=Busca owner/repo expanded=true`.
- **Impacto:** quien rellena el formulario con teclado se queda atascado en el campo y tiene que descubrir que Esc es la salida (WCAG 2.1.2 pide que, si la salida no es Tab/flechas, se avise). El resto del formulario es Tab-navegable.
- **Dónde mirar:** `components/kit/repo-combobox.tsx:104` — `PopoverContent` de Radix envuelve en un `FocusScope` con `loop`, y con un único elemento enfocable el Tab da la vuelta a sí mismo. Opciones: `onKeyDown` en `CommandInput` que, con Tab, cierre (`setOpen(false)`) y deje que el foco siga al siguiente campo (el popover está en un portal: mover el foco al disparador y dejar que el Tab continúe), o `onOpenAutoFocus`/`trapFocus` según la API de la versión instalada (Context7).
- **Para:** frontend-build
- **Reproducible:** siempre (`qa-batch-2026-11-18-combobox/1-tab-atrapado.mjs`)

### [Medio] Con el token de lectura caducado o revocado (401/403) el panel dice lo mismo que con GitHub caído, y no queda rastro en ningún log
- **Flujo:** Nuevo proyecto › Repositorio, con la lista fallando.
- **Pasos:**
  1. `node scripts/qa/github-fake.mjs --port 4310 --fail 401` (o `--fail 403`), servidor con `GITHUB_API_BASE=http://127.0.0.1:4310 GITHUB_READ_TOKEN=github_pat_qafake` bajo `qa:local`.
  2. Abrir `/new`.
  3. Repetir con `--fail 404`, `--fail 429`, `--fail 502`, el falso apagado y `--slow 5200`.
- **Esperado:** con 401/403 (un PAT fine-grained caduca como mucho al año; también si se revoca o pierde permisos) un aviso que diga qué hacer — «El token de lectura de GitHub ya no vale: renuévalo en `/etc/kit-deploy/github-read.env`» — o al menos una línea en el log del servidor con el estado (sin el token).
- **Ocurre:** en los siete casos el mismo campo de texto con «No se pudo cargar la lista de tus repos de GitHub. Escribe owner/repo.»; el log del servidor no registra nada (`listRepos` devuelve `{kind:"error", status}` y nadie usa `status`). El falso registra el 401; el panel no.
- **Evidencia:** `.qa/p8-fail.mjs` → `fail401`, `fail403`, `fail404`, `fail429`, `fail502`, `down`, `slow5200`: `combobox: 0`, mismo `repoHelp`; el log del servidor no tiene ninguna línea con «github», «repos» ni «401» (`grep -ci` = 0).
- **Impacto:** el selector se degrada a campo de texto para siempre, sin que César sepa por qué ni qué renovar. Lo positivo: nunca se rompe la página, el estado ni el token salen al navegador, y crear con el campo de texto sigue funcionando.
- **Dónde mirar:** `app/(panel)/new/new-project-form.tsx:54-59` (`REPO_HINT` solo distingue `no-token` / `error`; el `status` llega en `repos.status`) y `lib/github/repos.ts:102-106` (un `console.warn` con el estado, una vez por proceso o por cambio de estado).
- **Para:** frontend-build (+ backend-build para el log)
- **Reproducible:** siempre (`qa-batch-2026-11-18-combobox/4-token-caducado.mjs`, con el falso en `--fail 401`)

### [Bajo] Con GitHub lento (pero por debajo de 5 s por petición) y muchos repos, «Nuevo proyecto» se queda en el esqueleto ~23 s
- **Flujo:** Nuevo proyecto, carga de la lista.
- **Pasos:**
  1. `node scripts/qa/github-fake.mjs --port 4310 --slow 4500 --count 600`, sin lista en caché (reiniciar el servidor o esperar 5 min).
  2. Abrir `/new`.
- **Esperado:** un presupuesto total (p. ej. 5–8 s para todas las páginas); pasado, la lista parcial o la pista de error con el campo de texto.
- **Ocurre:** el esqueleto «Datos del proyecto» dura 23,0 s (`GET /new 200 in 22.9s`); el `timeoutMs: 5_000` es **por petición** y se siguen hasta 5 páginas (`REPOS_MAX_PAGES`), así que el peor caso es ~25 s. Luego sale bien: 500 opciones y «Se muestran tus 500 repos con push más reciente.»
- **Evidencia:** `.qa/p9-many.mjs` → `loaded 23007 ms`; log del falso: 5 páginas `-> 200`.
- **Impacto:** raro (hace falta GitHub degradado y >100 repos), pero la página parece colgada sin decir nada. Con un fallo sí se corta a los 5 s (`slow5200` → 5,5 s).
- **Dónde mirar:** `lib/github/repos.ts:86-101` (un `AbortSignal.timeout` común a todo el bucle, o un tope de tiempo además del de páginas).
- **Para:** backend-build
- **Reproducible:** siempre con esas condiciones (no dejo script: depende de vaciar la caché del proceso; los pasos bastan)

### [Bajo] Sin repo elegido el formulario sí se envía (el resto de campos lo frena el navegador) y, tras «Falta el repositorio.», el foco cae en `<body>`
- **Flujo:** Nuevo proyecto con la lista cargada.
- **Pasos:**
  1. `/new`, Nombre `v_prueba`, sin tocar Repositorio.
  2. Enter en Nombre (o clic en «Crear proyecto»).
- **Esperado:** lo mismo que con Nombre vacío (el navegador lo frena con el foco en el campo), o, si llega al servidor, el foco en el disparador de Repositorio.
- **Ocurre:** sale el POST de la acción; vuelve «Revisa los campos marcados.» + «Falta el repositorio.» con `aria-invalid` en el disparador (bien), pero tras pulsar el botón `document.activeElement` es `<body>` (con Enter en Nombre se queda en Nombre): quien va con teclado o lector de pantalla tiene que volver a recorrer la página. Con el campo de texto anterior el `required` nativo lo evitaba; el `<input type="hidden">` del combobox no admite `required`.
- **Evidencia:** `.qa/p4-state.mjs` → `emptyRepo: { posts: 1, errs: ["Falta el repositorio."], triggerInvalid: "true", focus: "<body …" }`.
- **Impacto:** un viaje al servidor evitable y foco perdido (WCAG 2.4.3). Nada se crea.
- **Dónde mirar:** `app/(panel)/new/new-project-form.tsx:167` (`onSubmit` en el `<form>` que, con `values.repo` vacío, haga `preventDefault` y enfoque el disparador) o, tras un fallo con `fields`, enfocar el primer campo con error.
- **Para:** frontend-build
- **Reproducible:** siempre (`qa-batch-2026-11-18-combobox/5-repo-vacio-foco.mjs`)

### [Bajo] Si el token no ve ningún repo, el selector abre vacío con «Ningún repositorio coincide» sin haber buscado nada
- **Flujo:** Nuevo proyecto, lista vacía (un PAT fine-grained con «Repository access: None» o sin `Metadata: read` devuelve `[]` con 200).
- **Pasos:** `node scripts/qa/github-fake.mjs --port 4310 --count 0`, sin lista en caché; abrir `/new` › Repositorio.
- **Esperado:** decir que el token no ve repos («Tu token de GitHub no tiene acceso a ningún repo. Escribe owner/repo.») o caer al campo de texto con esa pista, como con un error.
- **Ocurre:** combobox con 0 opciones y «Ningún repositorio coincide. Escribe owner/repo completo para usarlo.» con la búsqueda vacía. Escribir `mi-org/mi-repo` ofrece «Usar «mi-org/mi-repo»» (funciona). La lista vacía se guarda 5 min en caché como una buena.
- **Evidencia:** `.qa/p8-fail.mjs count0` → `combobox: 1, opts: 0, emptyMsg: "Ningún repositorio coincide…"`; `.qa/p10-empty.png`.
- **Impacto:** confuso; no bloquea.
- **Dónde mirar:** `app/(panel)/new/new-project-form.tsx:191` (tratar `repos.length === 0` como un tercer caso de `REPO_HINT`) o `components/kit/repo-combobox.tsx` (`CommandEmpty` distinto con `query` vacía).
- **Para:** frontend-build
- **Reproducible:** siempre con `--count 0`

### [Bajo] La lista ofrece igual los repos que ya tienen proyecto; al elegir uno, el error «Ya existe.» cae en Nombre
- **Flujo:** Nuevo proyecto › Repositorio.
- **Pasos:**
  1. Crear un proyecto con `qa-org/repo-020` elegido de la lista.
  2. Volver a `/new`, abrir Repositorio, buscar `repo-020`: aparece igual que los demás (solo «Privado»).
  3. Elegirlo, Nombre `c_nuevo` (libre), «Crear proyecto».
- **Esperado:** el repo ya conectado marcado en la lista (p. ej. «Ya es `s_lere_ok`», o deshabilitado), o al menos el error en Repositorio.
- **Ocurre:** aviso «Ya hay un proyecto llamado c_…, con el repo qa-org/repo-020 o con su dominio.» y `aria-invalid` / «Ya existe.» en **Nombre**, que está libre.
- **Evidencia:** `.qa/p7-misc.mjs` → `invalidField: ["name"]`.
- **Impacto:** con 130+ repos el selector es ahora el camino principal y no ayuda a evitar el choque; el campo marcado engaña. Amplía el [Bajo] «Repo repetido» del QA funcional del 18-11 (mismo origen, `lib/panel/actions/projects.ts:65-70`).
- **Dónde mirar:** `app/(panel)/new/page.tsx:38` (pasar al formulario los repos ya usados, `projects.repo`, en minúsculas) y `lib/panel/actions/projects.ts:65-70` (distinguir el choque de repo del de nombre).
- **Para:** backend-build + frontend-build
- **Reproducible:** siempre (`qa-batch-2026-11-18-combobox/2-repo-ya-conectado.mjs`)

### [Bajo] Al cerrar el selector con Esc (o clic fuera) la búsqueda se queda escrita; al reabrir, la lista sale filtrada y el resaltado no va al repo elegido
- **Flujo:** Nuevo proyecto › Repositorio.
- **Pasos:**
  1. `/new`, abrir «Repositorio», elegir `qa-org/repo-002` (Enter).
  2. Reabrir (Espacio), teclear `repo-01`, pulsar Esc.
  3. Reabrir (↓).
- **Esperado:** búsqueda vacía, las 130 opciones y el resaltado (y el scroll) en el repo elegido, como en un select.
- **Ocurre:** el campo de búsqueda conserva `repo-01` y solo hay 10 opciones; si no se tecleó nada, el resaltado va siempre a `qa-org/repo-001` (la ✓ de `repo-002` está, pero con un repo elegido más abajo de la séptima fila queda fuera de la vista).
- **Evidencia:** `.qa/p2-keyboard.mjs` → `queryAfterEscReopen: "repo-01"`, `countAfterEscReopen: 10`, `highlightOnReopen: "qa-org/repo-001"`; captura `new-1440-open.png`.
- **Impacto:** confuso, no rompe nada (el valor no cambia con Esc).
- **Dónde mirar:** `components/kit/repo-combobox.tsx:56-61` — `setQuery("")` solo en `pick`; limpiarlo también en `onOpenChange(false)` y pasar `value` a `<Command>` para que cmdk resalte el elegido.
- **Para:** frontend-build
- **Reproducible:** siempre (`qa-batch-2026-11-18-combobox/3-query-persiste.mjs`)

## No verificado
| Qué | Por qué no se pudo |
|---|---|
| Rendimiento con 500 repos en build de producción | Solo se probó en dev: abrir 0,8–1,0 s, teclear 6 caracteres 4,1 s, elegir 1,8 s (cmdk sin virtualizar, React en modo dev). Habría que repetir `.qa/p9-many.mjs` con `qa:local --preview` y el falso en `--count 600`; si sigue >1 s por pulsación, sería un [Medio]. |
| Dos cargas simultáneas con la caché vacía | Con `--slow 4500 --count 600` el falso recibió dos tandas de 5 páginas en ~2 min, y una carga posterior tardó 23 s cuando la lista debía estar en caché. Puede ser la doble renderización de dev o falta de deduplicación de peticiones en vuelo en `listRepos`; no lo aislé. Intermitente, sin pasos fiables. |
| `GITHUB_API_BASE` sin `QA_LOCAL` | Solo por lectura, como se pidió: `githubApiFromEnv` (`lib/github/repos.ts:42-58`) exige `env.QA_LOCAL === "1"` **y** el patrón loopback anclado; si no, devuelve `https://api.github.com` y avisa una vez sin el valor. Lo cubren `tests/unit/github-repos.test.ts:353` («outside qa:local even a loopback base is ignored», también `QA_LOCAL: "true"`) y `:380-410` (otros valores y log sin eco). `nextPath` exige `${api}/` como prefijo, así que `:43100` no pasa por `:4310`. `QA_LOCAL` solo lo pone `scripts/qa-local.ts` (`:718`, `:918`, `:1123`, `:1222`); `infra/` y `templates/` no lo mencionan. El cliente del token de estado (`lib/deploy/github.ts`) no lee la variable (test `:265`). Conforme. |
| Base `http://localhost:<p>` y `http://[::1]:<p>` | Aceptadas por el patrón, pero el falso solo escucha en `127.0.0.1`; con `[::1]` no conectaría nunca (caería a la pista de error). No probado: es de las herramientas de QA, no del panel. |
| Lector de pantalla real | Solo se comprobaron atributos (`aria-expanded`, `aria-invalid`, «(elegido)» oculto); hay dos `role=combobox` (el disparador y el input de cmdk), que conviene que mire `a11y`. |

## Datos creados
Todo en la base local desechable `qa_4301` (el siguiente `qa:local` la recrea): 10 proyectos de prueba (`t_0pc1_*`, `n_617i_*`, `s_lere_*`, `c_*`, `rc_*`…) con sus 10 tokens de despliegue, la sesión de `scripts/qa-session.ts`. Nada remoto (el «GitHub» era el falso local). Nada que borrar a mano.

## Acciones requeridas de César
Ninguna para seguir probando. Solo una decisión de contenido:

1. **Texto de la pista para un token de lectura caducado (401/403)** si se acepta el [Medio]
   - Por qué: `REPO_HINT` (fila 45 de CONTENT_CHECKLIST) es provisional y hoy no distingue el caso.
   - Qué necesito de vuelta: sí/no a algo como «El token de lectura de GitHub ya no vale. Renuévalo en el VPS (`/etc/kit-deploy/github-read.env`) y mientras tanto escribe owner/repo.»

## Camino feliz
- `/new` con el falso (130 repos, 2 páginas): combobox con 130 opciones, «Privado» en uno de cada tres, sin texto del token en la página.
- Búsqueda: sin distinguir mayúsculas (`REPO-002`, `QA-ORG/REPO-002` → el de la lista, sin «Usar»), recorta espacios, `qa-org/` y `/` dejan todo, `repo-0` → 99; un `owner/repo` válido fuera de la lista ofrece «Usar «…»» (también 100 caracteres de nombre); `a/b/c`, `owner/`, `qa-org//repo-001`, unicode, emoji y `<script>` → «Ningún repositorio coincide…», sin ejecutar nada. 250 caracteres no desbordan (popover del ancho del disparador, `scrollWidth` = viewport).
- Teclado: Tab desde Nombre al disparador; Enter/Espacio/↓ abren con el foco en la búsqueda; ↓↓, End, ↑ mueven el resaltado; teclear filtra; Enter elige y devuelve el foco al disparador; Esc cierra sin cambiar el valor; Enter sin coincidencias no envía el formulario.
- Elegir `repo-002` → Rama `develop`; luego `repo-004` → `master`; «Usar «otro-owner/otro-repo»» → `main`; una rama escrita (`release/v1`) se conserva al cambiar de repo.
- Envío: `qa-org/repo-020` + `release/v1` → proyecto en BD con ese repo, rama y 512 MB; el token se muestra con `gh secret set KIT_DEPLOY_TOKEN -R qa-org/repo-020`. «Ya lo guardé» deja el formulario limpio (disparador «Elige un repositorio», rama `main`) y elegir después un repo vuelve a seguir su rama por defecto. Doble clic en «Crear proyecto» con repo elegido → 1 POST, 1 proyecto, 1 token.
- Un envío rechazado (nombre `www`) conserva el repo elegido y la rama; recargar vacía el formulario (sano); atrás desde `/` vuelve a `/new` limpio, sin el token.
- 1440 px: Nombre | Repositorio y Rama | Memoria en dos columnas (D066); 390 px: una columna, sin scroll horizontal, popover de 316 px, «Usar «…»» largo se parte en varias líneas. Fuente de la búsqueda y del disparador 16 px (sin zoom en iOS).
- Fallos (`--fail 401/403/404/429/502`, falso apagado, `--slow 5200`): campo de texto con «No se pudo cargar la lista…» en ≤5,5 s; `--count 600`: 500 opciones y «Se muestran tus 500 repos con push más reciente.».

## Feedback para el kit
| Tipo | Archivo | Clase | Regla que lo habría evitado |
|---|---|---|---|
| Prevención | reference/QA-PREVENTION.md | Un combobox hecho con Popover + Command (shadcn) atrapa el Tab: el `FocusScope` del popover hace `loop` y con un solo enfocable el foco no sale | En un combobox sobre popover, Tab desde la búsqueda cierra el popover y el foco sigue al campo siguiente (como un select nativo); se comprueba abriendo y pulsando Tab |
| Prevención | reference/QA-PREVENTION.md | Un control propio que lleva su valor en `<input type="hidden">` se salta la validación nativa `required`: el formulario llega al servidor sin él y, tras el error, el foco queda en `<body>` | Un control obligatorio sin `required` nativo frena el envío en el cliente y se enfoca; y tras un rechazo con errores de campo, el foco va al primer campo marcado |
| Prevención | reference/QA-PREVENTION.md | La credencial de un servicio externo caduca (401/403) y la UI dice lo mismo que con el servicio caído, sin log | 401/403 de una API externa se distinguen en la UI («renueva el token en …») y se registran una vez con el estado, nunca con el valor |
