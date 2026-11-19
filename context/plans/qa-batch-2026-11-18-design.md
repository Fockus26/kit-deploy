# QA de diseño — panel completo — main @ 599afcc — 2026-11-18/19

**Entorno:** Chromium (Playwright) · build `--preview` en `http://localhost:4302` (slot wt2, Postgres QA en Docker, sin agente: estado "kit-agent caído" a propósito) · datos de `qa-seed` (maranatha, kd_hello, proyecto de 40 caracteres) · verificado en navegador: sí.
**Resultado:** 0 críticos · 2 altos · 5 medios · 4 bajos
Capturas: `context/plans/qa-batch-2026-11-18-design/` (≈120 jpg: 360/1280/1536/2560/3840 claro, 1440 y 390 oscuro, forced-colors, 400 %).
Scripts en el slot: `.qa/design-sweep.mjs` (barrido, fases a-d), `.qa/analyze.mjs`, `.qa/repro/1..4-*.mjs`.

## Resumen
Sin scroll horizontal en ningún ancho 320–3840, claro y oscuro (408 vistas + `panel-reflow.mjs`: 154 vistas, 0). axe (wcag2a/aa/21a/21aa) 0 violaciones en 17 rutas x claro/oscuro x 390/1440. Foco visible en todos los paradas de Tab (0 sin anillo). Movimiento respeta reduced-motion. Lo que importa: (1) las tablas en móvil rompen palabras y SHAs letra por letra por `[overflow-wrap:anywhere]` en las celdas; (2) con la fuente del navegador al 200 % el Notice y la alerta de Ajustes desbordan la página; (3) botones de 32–40 px bajo 768 contra el token `size.control` = 44 px.

## Hallazgos

### [Alto] Tablas en móvil parten palabras y SHAs ("Construyen/do", "Producció/n", "c4d2e8/f")
- **Dónde:** `/`, `/p/<p>/deployments`, `/p/<p>/env` (también 768 en deployments e inicio) · `components/kit/data-table.tsx:115` (`px-4 py-2.5 align-middle [overflow-wrap:anywhere]` en cada `td`).
- **Condición:** 320–430 px (y 768 en Despliegues), claro y oscuro.
- **Qué pasa:** `anywhere` reduce el ancho mínimo de columna a 1 carácter; la tabla se comprime dentro de su caja con scroll en vez de scrollear. Medido con Range: palabras en >1 línea: Construyendo, Producción, 6 SHAs, "disponible", "Visible", "Pública", "Secreta", "••••••••".
- **Por qué importa:** los estados (el dato principal del panel) y los SHAs copiables se vuelven ilegibles en móvil; el chip de estado se parte.
- **Evidencia:** `p-maranatha-deployments-390-dark.jpg`, `p-maranatha-env-390-dark.jpg`, `home-390-dark.jpg`; `node .qa/repro/1-word-break.mjs` → FAIL (lista por ruta/ancho). Grep: `grep -rn "overflow-wrap:anywhere" components app`.
- **Corrección sugerida:** `whitespace-nowrap` en celdas de estado/SHA/entorno/tipo y `min-w-max` (o min-width por columna) en la `<table>`; dejar `anywhere` solo en las columnas de texto libre (dominio, detalle).
- **Tipo:** implementación

### [Alto] Con fuente del navegador al 200 % (390 px) el Notice desborda la página
- **Dónde:** `components/kit/notice.tsx:59` (`min-w-48 flex-1`), `app/(panel)/settings/page.tsx:150` y `:195` (`min-w-48`).
- **Condición:** fuente estándar del navegador 32 px (CDP `Page.setFontSizes`) a 390 px. A 150 % @1280 y 200 % @1280: sin desborde.
- **Qué pasa:** `min-w-48` = 12 rem = 384 px a 32 px de base, más padding y icono: scrollWidth 449 > 390 en `/p/*` (todas las pestañas) y 457 > 390 en `/settings`.
- **Por qué importa:** usuarios de baja visión que suben la fuente (no el zoom) pierden WCAG 1.4.10 en las páginas con aviso, que es el aviso de error principal.
- **Evidencia:** `node .qa/repro/4-notice-font200.mjs` → FAIL (5 rutas). Grep: `grep -rn "min-w-48" components app`.
- **Corrección sugerida:** `min-w-0` en esos contenedores (el `flex-wrap` ya los baja de línea), o `min-w-[min(12rem,100%)]` con token.
- **Tipo:** implementación

### [Medio] Objetivos táctiles bajo el token `size.control` (44 px bajo 768)
- **Dónde:** botón de tema (80x32), "Reintentar" (109x32), "Copiar" (87x32), pestañas del proyecto/Variables/Despliegues (`min-h-10`/`h-10` = 40), "Reiniciar"/"Nuevo proyecto"/"Crear proyecto"/"Cancelar" (40 a 768), "Entrar con passkey" y "Usar código…" (40 a 768 en login), SHAs-enlace (47x37), "Ver todos" (53x16), enlace de proyecto en la tabla de inicio (17 de alto).
- **Condición:** ≤768 px. Área real medida con `elementFromPoint` en los bordes de la caja de 44.
- **Qué pasa:** `DESIGN_TOKENS.md` dice `size.control` 44 px bajo 768 y 40 desde 768; hay ~75 controles distintos que no llegan. Algunos de 768 caen en el rango "tableta" donde el token ya vale 40, pero a 320–430 incumplen el token.
- **Evidencia:** `node .qa/analyze.mjs` (sección SMALL TARGETS; datos `.qa/out/measure.json`). Los `select 1x1` son el nativo oculto de shadcn Select: falso positivo, no cuentan.
- **Corrección sugerida:** `min-h-control` en los botones `sm`, tabs y enlaces de tabla (área táctil con padding o `::before`, medir con elementFromPoint).
- **Tipo:** implementación (el token ya lo dice)

### [Medio] El aviso "No se pudo hablar con kit-agent" se repite apilado
- **Dónde:** `/p/<p>/*`: aviso en la cabecera del proyecto + otro en el cuerpo (Logs en vivo, Variables "No se pudieron abrir…", Logs). En Logs son dos idénticos a 100 px uno del otro (`p-maranatha-logs-1280-light.jpg`).
- **Condición:** agente caído (el estado QA local; en producción pasa cuando el agente cae).
- **Qué pasa:** la cabecera + aviso + pestañas ocupan ~370 px de 900 a 1280–1536, el contenido empieza a y≈400. Con el aviso duplicado el contenido real baja más.
- **Por qué importa:** es justo la pregunta de César sobre aprovechar el espacio en laptop: el aviso de cabecera ya lo dice todo; los del cuerpo podrían ser una línea sin diagnóstico repetido.
- **Corrección sugerida:** mostrar el bloque completo una sola vez (cabecera) y en el cuerpo un estado vacío corto ("Sin datos: kit-agent caído").
- **Tipo:** decisión de diseño

### [Medio] forced-colors: el botón primario pierde su forma
- **Dónde:** "Redeploy", "Crear proyecto", etc. (variante primary) y chips de estado.
- **Condición:** `forcedColors: 'active'`.
- **Qué pasa:** "Redeploy" queda como texto plano sin borde (los otros botones sí tienen); los chips de estado ("Construyendo") pierden borde (icono + palabra se mantienen).
- **Evidencia:** `p-maranatha-env-forced.jpg` (y `*-forced.jpg` de cada ruta).
- **Corrección sugerida:** `border border-transparent` en el botón primario (se vuelve visible en forced-colors) o `forced-colors:border-[ButtonText]`.
- **Tipo:** implementación

### [Medio] Líneas de texto >75 caracteres en ≥1920 px
- **Dónde:** `/settings` (párrafo de "Añadir otra passkey" ≈99 caracteres/línea; alertas ≈101) y `/p/<p>/domains` (≈82).
- **Condición:** 1920/2560/3840 (el contenido se detiene en 1440 de ancho, así que también en 1536: ≈99).
- **Evidencia:** `.qa/analyze.mjs` sección LONG; `settings-1536-light.jpg`.
- **Corrección sugerida:** `max-w-prose` (≈65–75ch) en los `<p>` descriptivos.
- **Tipo:** implementación

### [Medio] Laptop 1280–1536: formularios angostos a la izquierda, mitad derecha vacía
- **Dónde:** `/new` (formulario de 560 px en 1040–1296 útiles: 450–700 px vacíos a la derecha), "Nuevo token" en Ajustes (la mitad de ancho, derecha vacía).
- **Qué pasa:** el resto del panel (Resumen, Dominios, Variables) sí usa dos columnas bien; `/new` y "Nuevo token" quedan en una columna sola.
- **Corrección sugerida:** en `xl` poner al lado una columna de ayuda (cómo se enlaza el repo, el token se ve una vez) o centrar; nueva decisión visual → 3 opciones con César.
- **Tipo:** decisión de diseño

### [Bajo] 2560 y 3840: contenido tope 1440 pegado a la izquierda
- **Dónde:** todas las rutas del panel; `main` mide left 240 / width 1440 en 1920, 2560 y 3840 (`home-2560-light.jpg`, `home-3840-light.jpg`).
- **Qué pasa:** ~880 px vacíos a la derecha a 2560, ~2200 a 3840. Parece deliberado (`max-w` de 1440 más sidebar); el tope de línea ayuda, pero no está centrado.
- **Tipo:** decisión de diseño (centrar el contenedor o subir el tope solo para tablas y rejillas).

### [Bajo] Pestañas del proyecto cortadas a 360 sin pista de scroll
- **Dónde:** `ProjectTabs` a 360–390 ("Variabl" cortada en `p-maranatha-360-light.jpg`). Scrollea dentro de su caja (sin scroll de página); no hay degradado ni indicio.
- **Corrección sugerida:** máscara de borde o scroll automático a la pestaña activa.
- **Tipo:** implementación

### [Bajo] Valores mágicos
- `components/kit/notice.tsx:57`, `app/(panel)/settings/page.tsx:148` → `size-[18px]`; `app/enrol/enrol-flow.tsx:481` → `min-[360px]:grid-cols-2`; `components/kit/data-table.tsx:87` y otros (26 coincidencias) → `tracking-[0.08em]`.
- Grep: `grep -rnE 'size-\[[0-9]+px\]|tracking-\[|min-\[[0-9]+px\]' components app --include=*.tsx`.
- Sin hex/rgb sueltos ni colores crudos de Tailwind en componentes.

### [Bajo] Aviso en Ajustes/Auditoría sin datos para ejercitar la paginación
- La semilla solo tiene 5 filas: `?pagina=2` se muestra "Página 1 de 1" con ambos botones desactivados (correcto, sin desborde a ningún ancho). Ver "Sin verificar".

## Sin verificar
- Paginación de Auditoría con >20 filas (semilla de 5): solo comprobado el estado de 1 página y `?pagina=2` fuera de rango.
- Diálogo de quitar passkey (#69): el QA no tiene passkeys, no se pudo abrir.
- Combobox de repos de #71 con token de GitHub: sin token solo se ve el fallback de texto (visto en `/new`, correcto).
- Ruta `error.tsx` / `global-error` / offline / mantenimiento: no se pudieron provocar; 404 sí (HTTP 404 real en `/ruta-inventada` y proyecto inexistente, mismo marco que el panel).
- Filtros de daltonismo, `::selection`, scrollbar, placeholders y contraste sobre degradados: no medidos a mano (axe 0 violaciones).
- Interacción por teclado de Select/Combobox (abrir/cerrar, Escape, retorno de foco), regreso del foco al cerrar la hoja de detalle: no recorrido.
- En el recorrido con Tab, "fuera de pantalla" (top>900) aparece en botones de abajo de Ajustes/Dominios/Variables: puede ser que el navegador aún no había desplazado; no se confirmó como hallazgo.
- Con agente real: Logs, Bases, valores de variables (solo el estado de agente caído).
- Favicon claro/oscuro, imagen OG (#70): no revisados.
- Falso positivo descartado: la hoja de detalle (`div.fixed.inset-y-0.z-50`) aparecía fuera del viewport en mediciones a 300 ms; a 2,5 s está en 1440/1440 y la animación (`kd-sheet-in-right`, 0,2 s) pasa a 0 s con reduced-motion (`.qa/repro/2-sheet-motion.mjs`).

## Coherencia del sistema
- Sin hex sueltos; px mágicos listados arriba. Botones de la misma jerarquía iguales entre páginas; chips de estado icono + palabra consistentes. Contenedor igual (left 240, max 1440) en todas las rutas.
- Alturas de control mezcladas: `min-h-10` (40), `h-10`, `min-h-8` (32), `min-h-control`: el token existe pero no se usa en tabs, "Reintentar", "Copiar" ni el botón de tema.
- Login (incluidos los formularios de código de app y recuperación, 360 y 1280 oscuro): sin desborde, el foco va al campo; coherente con el resto.

## Matriz de cobertura
| Ruta | 320 | 360 | 390/430 | 768 | 1024 | 1280/1440 | 1536 | 1920 | 2560 | 3840 | Zoom 200/400 | Fuente 150/200 | Oscuro | Forced |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /login (+códigos) | ✅ | ✅ | ✅ | ⚠️ 40px | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| / | ⚠️ tabla | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ vacío | ⚠️ | ✅ | ✅ | ⚠️ tabla | ✅ |
| /new | ✅ | ✅ | ✅ | ⚠️ 40px | ✅ | ⚠️ vacío | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ primario |
| /settings (+pagina=2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ 99ch | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ 200% 390 | ✅ | ✅ |
| /p/x resumen | ✅ | ⚠️ pestañas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ❌ 200% 390 | ✅ | ✅ |
| deployments (+detalle) | ❌ tabla | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ❌ | ❌ tabla | ✅ |
| previews, domains, cron | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ 82ch | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ |
| env | ❌ tabla | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ |
| databases, logs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ |
| 404 (2 variantes) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Feedback para el kit
- Prevención · reference/QA-PREVENTION.md · Tablas con scroll interno cuyas columnas se comprimen hasta partir palabras (`[overflow-wrap:anywhere]` en `td`): la regla que lo evita al construir: en `DataTable` las celdas de estado, código y número llevan `whitespace-nowrap` y la tabla un `min-w-max`; `anywhere` solo en columnas de texto libre; medirlo con Range (`.qa/repro/1-word-break.mjs`).
- Prevención · reference/QA-PREVENTION.md · `min-w-<n>` en unidades rem dentro de contenedores flex desbordan con la fuente del navegador al 200 % (rem crece, el viewport no): usar `min-w-0` y dejar que `flex-wrap` baje de línea; probar siempre con `Page.setFontSizes` 32 px a 390.
- Prevención · reference/QA-PREVENTION.md · Botón primario sin `border` desaparece en forced-colors: toda variante rellena lleva `border border-transparent`.
- Prevención · el token `size.control` (44 px móvil) existe pero los componentes `sm`/tabs/enlaces de tabla usan alturas sueltas: un lint/grep de `min-h-8|h-8|min-h-10` bajo `md:` en el chequeo del kit.
- El script `design-qa.ts` del kit bastaría con añadir la medición de Range (palabra partida) como fase fija; la hoja que aparece fuera del viewport mientras anima da falso positivo a 300 ms: esperar `animationend` antes de medir `position: fixed`.
