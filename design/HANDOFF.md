# HANDOFF — kit-deploy · panel

> Traspaso del diseño a desarrollo (fase 05). Fuente: el lienzo **kit-deploy · Panel**
> (https://claude.ai/artifact/BM2D4sybuXcLoczzjw9b5m), aprobado por César el 2026-11-17, hecho en
> sesión a partir de `design/BRIEF-kit-deploy.md` (no pasó por Claude Design: D021). Dirección D007.
> Estructura = brief §9.2. Valores concretos; si algo no está aquí, se toma de `context/COLORS.md`,
> `DESIGN_TOKENS.md`, `TYPOGRAPHY.md`, que coinciden con este documento.
>
> Pantallas dibujadas: Inicio, Proyecto·Resumen, Variables, Dominios, Móvil (Proyecto a 390),
> Estados y diálogos. Las demás páginas (Despliegues, Previews, Logs, Bases, Nuevo proyecto,
> Ajustes, Login) **se componen con las mismas piezas** según §3; no tienen lienzo propio.

## 1. Tokens

### Color (los mismos nombres que `app/globals.css`, variables de shadcn)

| Token | Oscuro (por defecto) | Claro | Uso | Contraste verificado |
|---|---|---|---|---|
| `--background` | #0B0D10 | #F6F7F9 | página | — |
| `--nav` | #0F1216 | #FFFFFF | barra lateral, cabecera móvil, visor de logs | — |
| `--card` | #12151A | #FFFFFF | tarjetas, tablas, formularios | — |
| `--raised` | #1A1F27 | #EEF0F3 | ítem de nav activo, pista de medidores, skeleton | muted sobre raised oscuro 6.48:1 |
| `--foreground` | #E6E8EB | #0F1419 | texto | 14.90:1 sobre card · 18.51:1 claro |
| `--muted-foreground` | #9AA3AE | #5B6573 | etiquetas, metadatos, tiempos | 7.16:1 · 5.51:1 sobre #F6F7F9 |
| `--border` | #232830 | #E1E4E8 | bordes decorativos de 1px | decorativo |
| `--input` | #5E6776 | #8A94A1 | borde de input/checkbox/radio | 3.20:1 · 3.07:1 |
| `--primary` | #5B9BFF | #1F5FD1 | botón primario, pestaña activa, barra de medidor | texto #08111F encima 6.82:1 · #FFFFFF encima 5.81:1 |
| `--primary-foreground` | #08111F | #FFFFFF | texto sobre primario | ver arriba |
| `--primary-text` | #7AB0FF | #1F5FD1 | enlaces, SHAs, foco | 8.26:1 sobre card · 5.81:1 |
| `--success` / `--success-surface` | #5EE6A0 / #10291D | #0E7A45 / #E7F6EE | Activo, Listo | 9.80:1 · 4.84:1 |
| `--warning` / `--warning-surface` | #FFB86B / #2E2110 | #8A5200 / #FFF4E0 | Aviso, certificado por vencer | 9.19:1 · 5.86:1 |
| `--destructive` / `--destructive-surface` | #FF8A8A / #2E1416 | #B42318 / #FDECEA | Falló, Error, Borrar, Parar | 7.54:1 · 5.75:1 |
| `--info` / `--info-surface` | #7AB0FF / #122440 | #1F5FD1 / #E8F0FD | Construyendo, avisos informativos | 7.01:1 · 5.06:1 |
| `--destructive-solid` / `--destructive-on` | #FF8A8A / #2A0B0D | #B42318 / #FFFFFF | botón "Parar producción" | 8.0:1 · 6.57:1 |
| `--overlay` | rgb(0 0 0 / .55) | rgb(15 20 25 / .35) | fondo de diálogo | — |
| `--selection` / texto | #1E3A66 / #E6E8EB | #C9DBFA / #0F1419 | `::selection` | 9.24:1 · 13.22:1 |
| scrollbar thumb / track | #5E6776 / #12151A | #7A8491 / #EEF0F3 | barra de scroll | 3.20:1 · 3.32:1 |

`--destructive-solid`, `--destructive-on` y `--overlay` son **nuevos** (los demás ya existen).

### Tipografía — Geist (texto) y Geist Mono (valores de máquina), números tabulares

| Rol | 360–1023 | 1024–1919 | ≥1920 | Interlineado | Peso | Tracking |
|---|---|---|---|---|---|---|
| h1 | 22px | 24px | 30px | 1.25 | 600 | 0 |
| h2 (título de sección) | 15px | 15px | 18px | 1.4 | 600 | 0 |
| h3 | 14px | 14px | 15px | 1.4 | 600 | 0 |
| cuerpo | 14px | 14px | 15px | 1.5 | 400 / 500 | 0 |
| tabla y mono | 13px | 13px | 14px | 1.5 (logs 1.7) | 400 / 500 | 0 |
| pequeño | 12px | 12px | 13px | 1.5 | 400 | 0 |
| etiqueta (`lbl`) | 11px | 11px | 12px | 1.4 | 500 | 0.08em, MAYÚSCULAS |
| valor de métrica | 20px | 22px | 24px | 1.2 | 500 mono | 0 |

Mono **solo** para: nombres de proyecto, SHAs, dominios, URLs de preview, nombres y valores de
variables, valores de métrica, comandos, horas de log, registros DNS.

### Espaciado, radios, sombras, tamaños, movimiento, z-index

- Espaciado (base 4): 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48 px (la escala de Tailwind).
- Radios: 4px chips, kbd, etiqueta de tipo · 6px botones, inputs, ítems de nav · 8px tarjetas,
  tablas, paneles, diálogos · 999px pastillas de estado y puntos.
- Sombras: ninguna en tarjetas (borde 1px). `shadow-md` 0 8px 24px rgb(0 0 0/.35) | rgb(15 20
  25/.12) para menús y popovers; `shadow-lg` 0 16px 48px rgb(0 0 0/.5) | rgb(15 20 25/.18) para
  diálogos y el sheet móvil.
- Tamaños: control 40px (44px en móvil < 768); botón compacto 32–36px solo en barras de tabla;
  sidebar 240px; cabecera 56px; contenido máx. 1440px.
- Movimiento: `duration.fast` 120ms, `duration.normal` 200ms, `easing.default`
  cubic-bezier(0.2, 0, 0, 1).
- z-index: contenido 0 · cabecera fija móvil 20 · dropdown/popover 40 · overlay+diálogo/sheet 50 ·
  toast 60.

## 2. Componentes

Cada uno en `components/kit/` salvo los de shadcn en `components/ui/`. Foco de todos: anillo
2px `--primary-text` con 2px de separación (`outline-offset: 2px`), nunca quitado.

| Componente | Base shadcn | Anatomía · medidas | Variantes / estados | Accesibilidad |
|---|---|---|---|---|
| **Button** | `button` | alto 40 (32/36 compacto), padding x 16 (14 en grupo de acciones), radio 6, icono 16 + gap 8, peso 500 | primary (`--primary`), outline (borde `--border`, texto foreground), destructive-text (outline con texto `--destructive`), destructive-solid, ghost/link (`--primary-text`). hover: primary +8% luz / outline fondo `--raised`; active: −4%; disabled: opacidad .5, sin hover; loading: spinner 16 en lugar del icono + `aria-busy`, deshabilitado | `<button>`; solo icono → `aria-label` |
| **StatusBadge** | — | pastilla alto 24 (22 en tablas), padding x 10/8, radio 999, icono 12 trazo 3 + gap 6, texto 12/500 | Activo/Listo (success), Construyendo (info, icono spinner girando 1s), Dormido/Guardado (raised + muted), Falló/Error (destructive, icono x), Verificando DNS (raised + muted, anillo), Emitiendo certificado (info), Aviso (warning, triángulo) | siempre icono **y** palabra; nunca solo color; el spinner `aria-hidden` |
| **StatusDot** | — | punto 8×8 radio 999 | mismos colores; solo en la sidebar junto al nombre | decorativo (`aria-hidden`): el estado lo dice la página |
| **CopyValue** | — | botón outline 32 alto, icono copiar 14 + "Copiar" 12px | reposo · copiado ("Copiado", icono check, 2 s, `aria-live=polite`) · error ("No se pudo copiar") | `aria-label="Copiar valor <valor>"` |
| **RelativeTime** | — | `<time datetime>` con "hace 14 min", "ayer", "hace 3 días"; `title` con fecha absoluta local | se refresca cada 60 s | el texto es el nombre accesible |
| **Meter** | — | tarjeta: etiqueta (`lbl`), valor métrica + "de X" mono 13 muted, barra 6px radio 999 pista `--raised` relleno `--primary`, nota 12 muted. En tabla: barra 80×6 + valor mono | ≥ 85 % relleno `--warning`; ≥ 95 % `--destructive` **y** texto "casi lleno" | `role="meter"` con `aria-valuenow/min/max` y `aria-label` |
| **Sparkline** | Chart (Recharts) | 100% × 40px, línea 2px sin ejes ni puntos | color `--primary`; 5xx en `--destructive` | `role="img"` con `aria-label` que resume la serie ("Tres errores 5xx aislados") |
| **MetricCard** | — | tarjeta padding 16, gap 6: etiqueta, valor + unidad, Sparkline | valor 5xx > 0 en `--destructive` | — |
| **DataTable** | data-table (TanStack) | dentro de tarjeta con `overflow-x:auto`; `min-width` propio por tabla (560–760); cabecera `lbl` muted padding 10/12×16; celdas 13px padding 10–12×16; separador 1px `--border` | hover de fila `--raised`; fila seleccionada borde izq. NO (prohibido): fondo `--raised` + `aria-selected`; vacío → EmptyState dentro | `<table>` real, `scope="col"`, `<caption>` (puede ser sr-only); columna de acciones con encabezado sr-only "Acciones" |
| **ConfirmDialog** | `alert-dialog` | ancho máx. 420, padding 24, gap 12, radio 8, `shadow-lg`, overlay `--overlay`; título h2 15/600 que nombra proyecto y despliegue; descripción muted con los dos SHAs; botones a la derecha, `flex-wrap` | normal (primario) · destructivo con nombre a escribir: el botón `destructive-solid` deshabilitado hasta que el input coincide exactamente | `role=alertdialog`, foco inicial en Cancelar, Esc cierra, foco vuelve al disparador |
| **LogViewer** | — | panel `--nav`, borde, radio 8, padding 12×16, mono 13/1.7; fila = hora (muted) · nivel (ancho 40: error `--destructive`, warn `--warning`, info muted) · texto; `white-space: pre` con scroll horizontal en la caja | Siguiendo (punto success + texto), En pausa (punto muted + "En pausa"), botón Pausar/Reanudar; nuevas líneas al final; si el usuario sube, se pausa solo | `role="log"`, `aria-label`; el auto-scroll respeta reduced-motion (salto sin animación) |
| **EnvTabs / Tabs** | `tabs` | alto 40, padding x 12, subrayado 2px `--primary` en la activa, peso 600 activa / 400 resto (muted), contador mono muted | Cron deshabilitado con etiqueta "Fase 06" (borde 1px, 10px `lbl`) | Pestañas de entorno: `role=tablist`. Pestañas de proyecto: **nav con enlaces** (`aria-current=page`), no tablist |
| **Field** (Input, Textarea, Checkbox, Radio) | `input`, `textarea`, `checkbox`, `radio-group`, `label` | input alto 40, padding x 12, radio 6, borde 1px `--input`, fondo `--background`; label 14/500 encima, gap 6; ayuda 12 muted debajo; checkbox/radio 18×18 con `accent-color: --primary` | error: borde `--destructive` + mensaje 12 `--destructive` con icono, `aria-invalid`, `aria-describedby`; disabled `--disabled` | label siempre visible; grupos en `fieldset` + `legend` |
| **Notice** | `alert` | fondo `*-surface`, borde 1px, radio 8, padding 12×16, icono 18 + gap 12, `flex-wrap`; acciones a la derecha | info (rebuild/redeploy), warning (alerta abierta), destructive (error de servicio) | `role=status` para avisos tras guardar; `role=alert` solo para errores |
| **EmptyState** | — | centrado, padding 40×24, icono 32 trazo 1.5 muted, h2 15/600, texto muted máx. 320, CTA primario | — | el CTA es `<a>` o `<button>` real |
| **Skeleton** | `skeleton` | barras 14px radio 4 `--raised`, anchos 45–85 % | pulso 1.5 s; sin pulso con reduced-motion | contenedor `aria-busy=true` + título visible "Cargando …" |
| **Sidebar / Nav item** | `sheet` (móvil) | ítem alto 36, padding x 8, radio 6, icono 16 + gap 8; activo fondo `--raised` + peso 500 + `aria-current=page`; sección "Proyectos" con `lbl` y punto de estado + nombre mono 13 (`overflow-wrap:anywhere`, nunca `truncate`) | hover fondo `--raised` 60 % | `<nav aria-label="Principal">`; skip link "Saltar al contenido" primero |
| **ThemeSwitch** | `dropdown-menu` | botón outline 32 con icono 16 + texto; menú Oscuro / Claro / Sistema | — | `aria-label="Tema: <actual>. Cambiar tema"` |
| **Breadcrumbs** | `breadcrumb` | 13px muted, separador "/", último en foreground | — | `<nav aria-label="Migas">` |

## 3. Secciones (orden del brief §6)

Ritmo vertical: 32px entre secciones de página, 12px entre el h2 y su contenido, 24px entre
cabecera de página y pestañas.

- **Shell** — flex con `flex-wrap`: sidebar `flex: 1 1 240px; max-width: 240px` + contenido
  `flex: 999 1 560px; min-width: 0`. Cabecera 56px: migas a la izquierda, ThemeSwitch a la
  derecha, padding x 32. `<main id="contenido">` padding 32, máx. 1440. **< 1024:** la sidebar se
  oculta y aparece la cabecera móvil (56px, fondo `--nav`): botón menú 44×44 + "kit-deploy" +
  migas cortas; el menú abre un Sheet izquierdo de 280px con el mismo contenido. Padding de main
  16px (< 768) / 24px (768–1023).
- **Inicio** — cabecera de página (h1 + subtítulo "N proyectos · último despliegue hace X" +
  botón primario "Nuevo proyecto", fila con `flex-wrap`, `align-items:flex-end`).
  *Estado del servidor:* grid `repeat(auto-fit, minmax(240px,1fr))` gap 16 de 3 Meter (Memoria,
  Disco, Carga). *Alertas abiertas:* lista de Notice warning (contador mono en el h2); sin alertas
  → una línea muted "Sin alertas abiertas". *Proyectos:* DataTable (Proyecto enlace mono, Producción
  StatusBadge, Dominio mono, Último despliegue SHA + RelativeTime, Memoria Meter de tabla).
  < 768: la tabla scrollea dentro de su caja (no se convierte en tarjetas).
- **Proyecto · cabecera** — h1 mono + StatusBadge; debajo, en 13 muted con gap 16 y `flex-wrap`:
  dominio principal (enlace), `rama@sha`, repo. Acciones a la derecha en fila `flex-wrap` gap 8:
  Reiniciar (outline), Parar (destructive-text), Rollback (outline), Redeploy (primario). **< 768:**
  Redeploy + Rollback visibles y "Más acciones" (44×44, dropdown con Reiniciar y Parar).
- **Pestañas del proyecto** — nav con enlaces, `overflow-x:auto` (scroll horizontal dentro de la
  barra en móvil, con margen negativo para tocar los bordes).
- **Métricas** — h2 + "últimas 24 h · se actualiza cada 30 s" a la derecha; grid
  `repeat(auto-fit, minmax(220px,1fr))` gap 16 de 4 MetricCard. < 768: grid fijo de 2 columnas, sin
  Sparkline, valor 20px.
- **Despliegues recientes + Previews activos** — fila flex `flex-wrap` gap 24: despliegues
  `flex: 3 1 520px`, previews `flex: 2 1 320px`. Despliegues: tabla sin cabecera (caption sr-only)
  con estado · SHA + mensaje · cuándo · duración · "Log de build" y "Rollback a este" (solo
  Guardado). Previews: tarjetas apiladas gap 8 con "#PR título", StatusBadge y URL mono 12;
  contador "N de 4 encendidos". < 768: despliegues como tarjetas (SHA + estado arriba, mensaje,
  cuándo) — es la única tabla que pasa a tarjetas, por ser de Resumen.
- **Logs en vivo** — h2 + estado Siguiendo + Pausar + "Ver todos"; LogViewer de las últimas 6–50
  líneas.
- **Despliegues** (sin lienzo) — filtros (EnvTabs Producción/Preview + select de estado) y
  DataTable completa (estado, entorno, commit, autor, cuándo, duración, acciones); el detalle abre
  en Sheet derecho de 480px (imagen, contenedor, puerto, health check, eventos) con Redeploy y
  Rollback.
- **Previews** (sin lienzo) — lista como en Resumen pero completa + Notice info de límite "4 de 4
  encendidos: el más antiguo se dormirá en el próximo push".
- **Variables** — h1 + texto "Cifradas en el servidor. Las secretas nunca se vuelven a mostrar:
  solo se pueden reemplazar." Notice info de rebuild/redeploy tras guardar (Rebuild primario +
  "Más tarde"). EnvTabs con contador. Fila flex `flex-wrap` gap 24: tabla `flex: 3 1 560px`
  (Nombre mono 500, Valor mono o "••••••••" con `aria-label="Valor oculto"`, Tipo etiqueta con
  candado para Secreta, Modificada, acciones Editar/Reemplazar + Borrar) y formulario
  `flex: 1 1 320px` en tarjeta padding 20 (Nombre, Valor textarea 3 filas, Secreta marcada por
  defecto, fieldset Entornos, Guardar + Cancelar). Debajo de la tabla, "Gestionadas por la
  plataforma": tarjeta con borde **discontinuo** con `DATABASE_URL` y etiqueta "Gestionada".
  < 1024: el formulario va debajo de la tabla a ancho completo.
- **Dominios** — h1 + texto del chequeo por minuto. DataTable (Dominio mono + "· por defecto",
  Estado, Certificado — texto en `--warning` si vence en ≤ 14 días, `--destructive` si error —,
  Redirección mono 12, Quitar). Fila flex: "Añadir dominio" `flex: 1 1 320px` (campo + radio de 3
  opciones + Añadir) y "Registros DNS para <host>" `flex: 2 1 520px` (texto de proveedor, tabla
  Tipo/Nombre/Valor/CopyValue, "Comprobar ahora" outline, última comprobación a la derecha).
- **Logs** (sin lienzo) — barra con `flex-wrap`: select de despliegue, select de día (14), campo
  de búsqueda literal, select de nivel; LogViewer a altura `calc(100vh - 280px)` mín. 360px;
  Descargar (outline).
- **Bases de datos** (sin lienzo) — DataTable (Base mono, Entorno, Tamaño, Conexiones, Último
  backup + StatusBadge) + "Crear base" primario; vacío → EmptyState.
- **Nuevo proyecto** (sin lienzo) — formulario en tarjeta máx. 560: nombre (mono,
  `^[a-z0-9][a-z0-9_]{0,39}$`), repo `owner/name`, rama (main), memoria (select 256/512/1024 MB).
  Tras crear: tarjeta del token con el valor en mono dentro de un recuadro `--raised`, CopyValue,
  el comando `gh secret set KIT_DEPLOY_TOKEN -R <repo>` y "Ya lo guardé" (después no se vuelve a
  ver).
- **Ajustes** (sin lienzo) — secciones apiladas gap 32: Acceso (passkeys en tabla, TOTP, códigos
  de recuperación), Alertas (fase 06: tarjeta deshabilitada "Llega en la fase 06"), Tokens de
  despliegue (tabla con último uso + Revocar destructive-text con ConfirmDialog), Auditoría
  (DataTable quién/cuándo/qué, nunca valores).
- **Login** (sin lienzo) — tarjeta centrada máx. 400 sobre `--background`, logo + título, botón
  primario "Entrar con passkey" a ancho completo, enlaces "Usar código de la app" y "Usar código
  de recuperación".

## 4. Grid y layout global

| Ancho | Layout | Padding lateral de main | Columnas de contenido |
|---|---|---|---|
| 320–767 | cabecera móvil + Sheet | 16px | 1 (grids de métricas: 2) |
| 768–1023 | cabecera móvil + Sheet | 24px | auto-fit (minmax 220–240) |
| 1024–1919 | sidebar 240 + contenido | 32px | auto-fit |
| ≥ 1920 | igual, contenido máx. 1440 alineado a la izquierda | 32px | auto-fit, tipografía del rango ≥1920 |

Ninguna página hace scroll horizontal a 320px: tablas y la barra de pestañas scrollean en su caja.

## 5. Assets

- Iconos: **lucide-react** (ya en el proyecto), trazo 2 (1.5 en EmptyState), 16px en botones y nav,
  12px en pastillas, 18px en avisos. Logo: el icono `Layers` de lucide en `--primary` + "kit-deploy"
  15/600 — provisional hasta un logo propio (pregunta abierta 1).
- Favicon / apple touch 180 / maskable: el mismo `Layers` en #5B9BFF sobre #0B0D10 (SVG fuente en
  `app/icon.svg`). Sin imágenes ni ilustraciones. Fuentes: Geist y Geist Mono por `next/font`.

## 5b. Pantallas de estado

- **Vacío** (Inicio sin proyectos, Bases sin bases, tabla vacía): EmptyState; copy "Aún no hay
  proyectos" + "Crea uno con su repo de GitHub. El primer despliegue llega con el siguiente push a
  main." + "Nuevo proyecto".
- **Cargando:** Skeleton dentro de la tarjeta de la sección con su h2 real; nunca spinner de
  página entera.
- **Error de servicio** (kit-agent no responde): Notice destructive en la sección afectada con
  "No se pudo hablar con kit-agent", la frase "Los sitios siguen sirviendo: no dependen del
  panel.", el comando de diagnóstico en mono y "Reintentar". El resto de la página sigue usable.
- **404:** dentro del shell; "404" mono muted, h2 22 "Esta página no existe", "Puede que el proyecto
  se haya renombrado o borrado.", enlace "Volver a Inicio". **500:** igual con "Algo falló en el
  panel" + "Reintentar" + el id de la petición en mono.
- **Confirmaciones:** rollback (nombra proyecto, SHA actual → SHA destino, mensaje y cuándo;
  primario "Hacer rollback"); parar producción, quitar dominio, borrar variable y revocar token
  (destructivos: escribir el nombre del proyecto o del host; botón destructive-solid).
- **Preview dormido / no existe** (páginas estáticas de Caddy): tarjeta centrada máx. 480 con los
  mismos tokens (CSS inline, sin fuentes externas: pila `system-ui`), título, una frase y enlace al
  panel. Móvil: misma tarjeta con padding 16.

## 5c. Emails

No aplica en la fase 05 (alertas = fase 06); se diseñan allí.

## 6. Movimiento

| Qué | Cómo | Con `prefers-reduced-motion` |
|---|---|---|
| Pestañas: indicador activo | el subrayado se mueve 200ms easing.default | salto sin animación |
| Dropdown / select / popover | opacidad 0→1 + translateY 4px→0, 120ms | solo opacidad |
| Diálogo | overlay opacidad 200ms; panel opacidad + scale .98→1, 200ms | solo opacidad |
| Sheet (móvil, detalle) | translateX 100% → 0, 200ms | solo opacidad |
| Cambio de estado de una fila de despliegue | la pastilla cambia; fondo de fila `--raised` que se desvanece en 1.2s | sin destello |
| StatusBadge Construyendo | spinner 1s linear infinito | estático |
| LogViewer siguiendo | nuevas líneas al final, scroll suave al fondo | scroll instantáneo, sin pulso del punto |
| Skeleton | pulso 1.5s | estático |
| Acordeón / paleta de comandos | no hay en v1 | — |

## 7. Orden de implementación

1. Tokens (`app/globals.css`: añadir `--nav`, `--destructive-solid`, `--destructive-on`,
   `--overlay`, la escala tipográfica por breakpoint) → 2. Shell (sidebar, cabecera, Sheet, tema,
   pestañas de proyecto) → 3. Componentes de §2 (dependen de 1) → 4. Capa de datos y acciones del
   panel (independiente de 2–3) → 5. Páginas: Inicio y Proyecto (dependen de 2–4), Variables,
   Dominios, Previews, Despliegues, Logs, Bases, Nuevo proyecto, Ajustes, Login → 6. Estados (§5b) →
   7. Repaso responsive 320–1920.

## 8. Decisiones y trampas

- **Bordes, no sombras** en todo lo que no flota (D007). No añadir sombra a las tarjetas.
- **Pestañas de proyecto = navegación con enlaces**; pestañas de entorno = tablist. No unificarlas.
- **Valores de secretos:** la UI no tiene ningún camino para mostrarlos; "••••••••" es texto fijo, no
  el valor enmascarado (no viaja al cliente).
- **Tablas que scrollean en su caja**, salvo los despliegues de Resumen en móvil (tarjetas). No
  convertir las demás en tarjetas.
- **El estado nunca solo por color:** punto de la sidebar es decorativo porque la página lo dice
  con palabra; en tablas siempre StatusBadge.
- **Rojo con moderación:** solo errores, 5xx > 0 y acciones destructivas. "Parar" va como texto
  rojo en botón outline, no relleno, para no competir con Redeploy.
- **El certificado en ámbar** a 14 días o menos, aunque el estado sea Listo: es intencional.
- **El borde discontinuo** de "Gestionadas por la plataforma" marca "no editable": no usarlo en otro
  sitio.
- **Nombres largos:** `overflow-wrap:anywhere`, nunca `truncate` solo.
- **Botones en fila:** siempre `flex-wrap`.

## 9. Preguntas abiertas

1. **Logo propio:** se usa el icono `Layers` de lucide. Recomendación: dejarlo en v1.
2. **Tema por defecto en `/login`:** el panel arranca en oscuro (D007); antes `/login` seguía al
   sistema. Recomendación: oscuro también en `/login`, con el selector disponible en el panel.
3. **Paleta de comandos (⌘K):** el brief la menciona en sombras; no está diseñada. Recomendación:
   fuera de v1.
