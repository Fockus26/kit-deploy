# Brief de diseño — kit-deploy

Eres un diseñador de producto senior. Vas a diseñar un dashboard/app completo para el proyecto
descrito abajo y, además, vas a entregar un documento de handoff para desarrollo (sección 9 de
este brief) que un desarrollador frontend usará para implementarlo sin volver a consultarte. Todo
el texto de la interfaz va en español.

## 1. El proyecto

**Qué es:** una plataforma de despliegue propia, al estilo de Vercel, que corre en un único
servidor (VPS) de su dueño. Cada proyecto web recibe un despliegue por cada merge, una URL de
preview por cada pull request, variables de entorno por entorno, dominios con HTTPS, rollback
instantáneo, logs, métricas, alertas y tareas programadas. Este dashboard es la ventana para verlo
y controlarlo todo.
**Tipo:** dashboard/app (herramienta interna)
**Audiencia:** una sola persona en v1, el dueño: desarrollador frontend que mantiene una docena de
proyectos. Entra para comprobar que un despliegue está arriba, revisar un preview desde el móvil,
cambiar una variable o volver atrás una versión rota. Conoce Git, GitHub y Vercel.
**Acción principal:** ver de un vistazo si un despliegue está bien y actuar sobre él (redeploy,
rollback, cambiar una variable).
**Idioma / mercado:** español; fechas en formato español, 24 h.

## 2. Personalidad visual

**Dirección elegida:** "Producto técnico oscuro".
**Debe transmitir:** precisión, calma, control, confianza.
**NO debe parecer:** un sitio de marketing · una terminal "hacker" de juguete · una plantilla
genérica de admin.

**Referencias:**
- El dashboard de Vercel — por la cantidad de información por pantalla en una lista de
  despliegues (estado, commit, autor, hora) sin sensación de desorden; no por su look.
- El dashboard de Railway — por cómo muestra métricas de un servicio junto a sus despliegues.
- Una maqueta previa aprobada por el dueño (descrita aquí porque no la ves): barra lateral oscura
  con la lista de proyectos y un punto de color + palabra de estado; página de proyecto con
  cabecera (nombre, pastilla "Producción lista", dominio enlazado, rama y SHA en monoespaciada,
  botones Reiniciar / Rollback / Redeploy), pestañas (Resumen, Despliegues, Previews, Variables,
  Dominios, Logs, Cron), cuatro tarjetas de métrica (CPU, Memoria contra su límite, Peticiones 24 h,
  Errores 5xx 24 h) con una barra de medidor, tabla de despliegues y, debajo, previews activos y
  logs en vivo en un panel monoespaciado. Superficies con borde de 1 px, sin sombras decorativas,
  un único acento azul saturado.

## 3. Restricciones de marca

**Logo:** no existe — diséñalo (sección 7): un logo horizontal "kit-deploy" sobrio y técnico.
**Colores obligatorios:** ninguno de marca; la paleta de la sección 4 está cerrada en sus roles
principales.
**Tipografía obligatoria:** Geist y Geist Mono (cerradas).
**Icono / isotipo:** diséñalo, derivado del logo (sección 7).
**Favicon y apple touch icon:** diséñalos (sección 7). **Imagen Open Graph:** no aplica (sitio
privado, no indexable).
**Otros:** el producto lo usa una sola persona: prioriza densidad y velocidad de lectura sobre
"onboarding". Nada de ilustraciones decorativas.

## 4. Sistema visual de partida

### Paleta
| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| primary | #1F5FD1 (texto #FFFFFF encima 5.81:1) | #5B9BFF superficies (texto #08111F encima 6.82:1) · #7AB0FF como texto (8.26:1 sobre #12151A) | botón primario, links, pestaña activa, foco |
| secondary | #5B6573 | #9AA3AE | iconos, acciones secundarias |
| background | #F6F7F9 | #0B0D10 (barra lateral y paneles de log #0F1216) | fondo de página |
| surface | #FFFFFF | #12151A (elevada/seleccionada #1A1F27) | tarjetas, tablas |
| text primary | #0F1419 (18.51:1 sobre #FFFFFF) | #E6E8EB (14.90:1 sobre #12151A) | cuerpo |
| text secondary | #5B6573 (5.51:1 sobre #F6F7F9) | #9AA3AE (7.16:1 sobre #12151A) | etiquetas, metadatos |
| success / warning / error / info | #0E7A45 sobre #E7F6EE (4.84:1) · #8A5200 sobre #FFF4E0 (5.86:1) · #B42318 sobre #FDECEA (5.75:1) · #1F5FD1 sobre #E8F0FD (5.06:1) | #5EE6A0 sobre #10291D (9.80:1) · #FFB86B sobre #2E2110 (9.19:1) · #FF8A8A sobre #2E1416 (7.54:1) · #7AB0FF sobre #122440 (7.01:1) | pastillas de estado (siempre con icono + palabra) |
| border / divider | #E1E4E8 decorativo · #8A94A1 bordes de input (3.07:1) | #232830 decorativo · #5E6776 bordes de input (3.20:1) | bordes |
| selection (fondo / texto) | #C9DBFA / #0F1419 (13.22:1) | #1E3A66 / #E6E8EB (9.24:1) | texto seleccionado; distinto del foco y los links |
| scrollbar (thumb / track) | #7A8491 / #EEF0F3 (3.32:1) | #5E6776 / #12151A (3.20:1) | barra de scroll discreta |

**Modo oscuro:** sí — obligatorio y es el tema por defecto; también modo claro (sigue la
preferencia del sistema y hay un selector). Puedes ajustar tonos intermedios si mantienes los
ratios; indica cualquier cambio en el handoff.

### Tipografía
- **Títulos:** Geist — 600
- **Cuerpo:** Geist — 400 / 500
- **Mono:** Geist Mono — 400 / 500, solo para valores de máquina: SHAs de commit, logs, valores de
  métrica, comandos, nombres de variables, URLs de preview, puertos
- **Escala (densa, apenas crece):** h1 22 / 24 / 30 px (móvil / tablet / ≥1920) · h2 15 / 15 / 18 ·
  h3 14 / 14 / 15 · cuerpo 14 / 14 / 15 · tabla y mono 13 / 13 / 14 · pequeño 12 / 12 / 13 · etiqueta
  11 / 11 / 12 en mayúsculas con 0.08em · valor de métrica 20 / 22 / 24 en mono. Números tabulares.

### Espaciado y forma
- Unidad base: 4px — todo espaciado es múltiplo (2, 4, 8, 12, 16, 24, 32, 48)
- Radios: 4px chips y kbd / 6px botones, inputs e ítems de navegación / 8px tarjetas y paneles /
  999px pastillas de estado
- Sombras: ninguna en tarjetas (solo borde de 1 px); sombra solo en lo que flota (menús, paleta de
  comandos, diálogos)
- Alto de controles 40px (área táctil ≥ 44px en móvil)

## 5. Restricciones no negociables

Aplican a **todo** lo que diseñes. Un diseño que las rompe no se puede implementar y hay que rehacerlo.

- **Contraste WCAG 2.1 AA.** Texto normal ≥ 4.5:1, texto grande (≥24px o ≥19px en negrita) ≥ 3:1,
  bordes de inputs e iconos informativos ≥ 3:1. Comprueba cada par que uses y anota el ratio.
- **Ningún estado se transmite solo con color.** Error, éxito, seleccionado, activo, "construyendo",
  "dormido": siempre color + icono, texto o forma.
- **Sin scroll horizontal a 320px de ancho** (las tablas anchas hacen scroll dentro de su caja).
- **Estados de foco visibles y diseñados**, no el contorno por defecto del navegador ni su ausencia.
- **Se implementa con Tailwind + shadcn/ui (Radix).** Usa la escala de espaciado de Tailwind.
  Puedes proponer tratamientos visuales propios: el componente se escribe a medida. Tablas con el
  patrón data-table (TanStack Table) y gráficos con el Chart de shadcn (Recharts).
- **Los secretos nunca se muestran:** una variable secreta enseña "••••" y la acción "Reemplazar",
  jamás su valor, ni siquiera a su dueño.
- **Acciones destructivas siempre confirman** (parar, rollback, borrar variable, quitar dominio)
  con un diálogo que nombra el proyecto y el despliegue afectado.
- **Breakpoints objetivo:** 360 · 768 · 1024 · 1440 · 1920.

## 6. Páginas y secciones

Todo, salvo el login, está detrás de la sesión.

### Login (`/login`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Logo + título | saber dónde estás | real | — |
| 2 | Entrar con passkey | la vía normal, un toque | real | "Entrar con passkey" |
| 3 | Código TOTP (alternativa) | si la passkey no está a mano | real | "Usar código de la app" |
| 4 | Código de recuperación | última vía | real | "Usar código de recuperación" |

### Inicio (`/`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Estado del servidor | memoria, disco y carga del VPS contra su total | placeholder realista | — |
| 2 | Alertas abiertas | lo que está mal ahora (sitio caído, certificado por vencer) | placeholder | ir al proyecto |
| 3 | Proyectos | lista/tabla: nombre, estado de producción, dominio, último despliegue, memoria | placeholder | abrir proyecto · "Nuevo proyecto" |

### Proyecto (`/p/[proyecto]`) — pestaña Resumen
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Cabecera | estado, dominio, rama@SHA, repo | placeholder | Reiniciar · Parar · Rollback · Redeploy |
| 2 | Pestañas del proyecto | Resumen, Despliegues, Previews, Variables, Dominios, Logs, Bases, Cron | real | — |
| 3 | Métricas | CPU, memoria contra límite, peticiones 24 h, 5xx 24 h, con mini gráfico | placeholder | — |
| 4 | Despliegues recientes | los 5 últimos (los que permiten rollback) | placeholder | "Ver log de build" |
| 5 | Previews activos | PR, URL, estado (máx. 4 encendidos) | placeholder | abrir preview |
| 6 | Logs en vivo | las últimas líneas siguiendo en tiempo real, con pausa | placeholder | "Ver todos" |

### Despliegues (`/p/[proyecto]/deployments`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Filtros | entorno (Producción / Preview), estado | real | — |
| 2 | Tabla | estado, entorno, commit (SHA + mensaje), autor, cuándo, duración | placeholder | "Log de build" (abre GitHub Actions) · "Rollback a este" |
| 3 | Detalle (panel o página) | un despliegue: imagen, contenedor, puerto, health check, eventos | placeholder | Redeploy · Rollback |

### Previews (`/p/[proyecto]/previews`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Lista | PR (número y título), URL, estado (Listo, Construyendo, Dormido, Falló), último push | placeholder | abrir · ver PR |
| 2 | Aviso de límite | "4 de 4 encendidos: el más antiguo se dormirá en el próximo push" | real | — |

### Variables (`/p/[proyecto]/env`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Pestañas de entorno | Producción, Preview, Desarrollo | real | — |
| 2 | Tabla | nombre (mono), valor (texto o "••••" si es secreta), tipo, última modificación | placeholder | Editar / Reemplazar · Borrar |
| 3 | Alta/edición | nombre, valor, "secreta" (por defecto sí), entornos | real | "Guardar" |
| 4 | Aviso tras guardar | variable de servidor → "Redeploy" (mismo build); `NEXT_PUBLIC_*` → "Rebuild" (nuevo build, minutos) | real | Redeploy / Rebuild |
| 5 | Variables gestionadas | `DATABASE_URL` y otras que pone la plataforma: visibles, no editables | real | — |

### Dominios (`/p/[proyecto]/domains`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Lista | dominio, estado (Verificando DNS, Emitiendo certificado, Listo, Error), certificado y vencimiento, redirección www ↔ raíz | placeholder | quitar |
| 2 | Añadir dominio | campo + elección www→raíz o raíz→www | real | "Añadir" |
| 3 | Instrucciones DNS | los registros a crear (tipo, nombre, valor, copiables) y el chequeo cada minuto | real | "Comprobar ahora" |

### Logs (`/p/[proyecto]/logs`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Barra | despliegue, día (últimos 14), búsqueda de texto, nivel | real | — |
| 2 | Visor | líneas en mono con hora y nivel, siguiendo en vivo, pausa | placeholder | pausar / reanudar · descargar |

### Bases de datos (`/p/[proyecto]/databases`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Lista | producción y `_preview`: tamaño, conexiones, último backup y su estado | placeholder | "Crear base" |

### Cron (`/p/[proyecto]/cron`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Trabajos | ruta, horario (expresión + texto legible), última ejecución y su resultado | placeholder | ejecutar ahora · editar · borrar · "Nuevo trabajo" |
| 2 | Historial | ejecuciones con estado HTTP, duración, hora | placeholder | — |

### Nuevo proyecto (`/new`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Formulario | nombre (solo minúsculas, números y guion bajo), repo de GitHub, rama de producción (main), límite de memoria | real | "Crear proyecto" |
| 2 | Token de despliegue | se muestra **una sola vez**, copiable, con el comando para guardarlo en el repo | real | "Copiar" · "Ya lo guardé" |

### Ajustes (`/settings`)
| # | Sección | Propósito | Contenido | CTA |
|---|---|---|---|---|
| 1 | Acceso | passkeys registradas, TOTP, códigos de recuperación | real | añadir passkey · regenerar códigos |
| 2 | Alertas | correo de destino, qué alertas están activas | real | guardar · "Enviar prueba" |
| 3 | Tokens de despliegue | por proyecto, último uso | placeholder | revocar |
| 4 | Auditoría | quién, cuándo, qué variable o acción (nunca valores) | placeholder | filtrar |

## 7. Estados y casos que también hay que diseñar

- [x] Estados vacíos (sin proyectos, sin previews, sin variables en un entorno, sin dominios, sin cron, logs sin resultados)
- [x] Estados de carga (skeletons por sección, no un spinner global)
- [x] **Pantallas de estado**, como una familia visual (cabecera mínima con el logo, una etiqueta,
      un título en la voz del producto, una línea de qué pasó, acciones):
  - [x] **404** — una sola (todo es con sesión; sin sesión se va al login): "Ir al inicio" + "Ver proyectos"
  - [x] **500 con código** (código visible y copiable; "Reintentar" + "Ir al inicio") y **500 sin código**
  - [x] **"Preview dormido"** (página que sirve el servidor cuando un preview está parado: qué PR es
        y que se despierta con el próximo push) y **"Preview no existe"** (PR cerrado o URL errónea)
  - Offline y mantenimiento: no aplican
- [x] Error dentro de una pantalla (guardar variable falló, el servidor no respondió): no a pantalla completa
- [x] Formularios: reposo, foco, relleno, error con mensaje, éxito, deshabilitado, enviando
- [x] Botones: reposo, hover, foco, activo, cargando, deshabilitado
- [x] Estados de despliegue en tiempo real: En cola → Construyendo → Arrancando → Activo / Falló, y
      cómo cambia la fila sin saltar
- [x] Diálogos de confirmación (rollback, parar, borrar variable, quitar dominio)
- [x] Notificaciones breves (toasts): "Copiado", "Variable guardada", "Rollback en curso"
- [x] Paleta de comandos (Ctrl K): ir a proyecto, redeploy, rollback, abrir logs
- [x] Navegación abierta en móvil (la barra lateral como panel)
- [x] Selector de tema claro / oscuro
- [x] Color de selección de texto y scrollbar, en claro y en oscuro
- [x] Icono derivado del logo: legible a 16 px, SVG para fondos claros y oscuros, apple touch icon
      180×180 con fondo opaco, maskable
- [x] **Plantillas de email** — la app envía alertas. Una familia con plantilla base (cabecera con
      logo, título, texto, botón + el enlace como texto debajo, pie con por qué lo recibe) y estos
      emails: sitio caído · sitio recuperado · certificado vence en menos de 14 días · disco por
      encima del 80 % · memoria al límite · backup fallido · despliegue de producción fallido. Cada
      uno con asunto y texto de vista previa (preheader). Restricciones del medio, no negociables:
      ancho máximo 600 px y una columna; tipografía que funcione con la pila de respaldo
      (`Arial, Helvetica, sans-serif`), porque Gmail y Outlook no cargan fuentes web; comprensible
      con imágenes bloqueadas (sin texto en imágenes); el logo se lee si el cliente invierte colores
      a oscuro; botón HTML ≥ 44 px de alto; contraste AA.
- [x] Contenido extremo: nombre de proyecto de 40 caracteres, mensaje de commit de 3 líneas, 1 y 50
      despliegues, 1 y 40 variables, una línea de log de 500 caracteres

## 8. Contenido

**Contenido real disponible:** los nombres de las secciones, acciones y estados de este brief; el
dominio de ejemplo `fockus.dev` (dashboard `deploy.fockus.dev`, previews
`<proyecto>-pr-<n>.preview.fockus.dev`).
**Pendiente:** todos los datos (proyectos, commits, métricas, logs). Usa ejemplos realistas: nombres
de proyecto como `maranatha`, `workout`, `krea`; SHAs de 7 caracteres; mensajes de commit en estilo
Conventional Commits en español ("feat: calendario de eventos", "fix: galería en móvil").

Para lo pendiente, usa texto realista en español con la longitud que tendrá el contenido final —
**nunca lorem ipsum**. Un diseño validado con lorem se rompe cuando llega el texto real, y esa rotura
la paga el desarrollador.

---

## 9. Entregable — OBLIGATORIO

Entrega **dos cosas**. La segunda es tan importante como la primera.

### 9.1 El diseño

Cada página de la sección 6 en escritorio 1440 · móvil 390, en oscuro y en claro, con los estados de
la sección 7.

### 9.2 `HANDOFF.md` — el documento de traspaso para desarrollo

Un documento Markdown autocontenido, escrito para un desarrollador frontend senior que **no vio el
diseño contigo y no puede preguntarte nada**. Lo que no esté aquí lo tendrá que inventar — y ahí es
donde el diseño se desvía.

Estructura exacta:

**1. Tokens** — una tabla completa de valores finales, con nombre de token, valor y uso: colores
(claro y oscuro, con el ratio de contraste verificado de cada par usado, incluidas selección y
scrollbar), escala tipográfica (tamaño / interlineado / peso / tracking por rol: display, h1-h6,
cuerpo, pequeño, caption), espaciado, radios, sombras, duraciones y curvas de animación, z-index.

**2. Componentes** — uno por uno, y para cada uno:
   - Nombre y, si corresponde a un componente de shadcn/ui, cuál
   - Anatomía (qué partes lo forman)
   - Variantes y tamaños
   - **Todos** los estados: reposo, hover, foco, activo, deshabilitado, cargando, error
   - Medidas concretas: padding, alto, gap, tamaño de icono, grosor de borde
   - Comportamiento responsive
   - Notas de accesibilidad: rol, nombre accesible esperado, comportamiento con teclado

**3. Secciones** — una por una, en el orden de la sección 6, y para cada una:
   - Estructura del layout (grid o flex, columnas, gaps, ancho máximo)
   - Qué componentes usa
   - Espaciado vertical antes y después
   - **Cómo se reordena o colapsa en cada breakpoint** (explícito, no "es responsive")
   - Contenido: qué es texto real y qué es placeholder

**4. Grid y layout global** — ancho máximo del contenedor, número de columnas y gutters por
breakpoint, padding lateral por breakpoint, ritmo vertical entre secciones.

**5. Assets** — una lista de todo lo que hay que exportar u obtener: imágenes (con dimensiones y
formato), iconos (con el set del que salen), ilustraciones, el logo en sus variantes, y los assets de
marca: icono fuente (SVG), favicon, apple touch icon 180×180 e icono maskable. (Imagen Open Graph: no
aplica.)

**5b. Pantallas de estado** — para cada variante de la sección 7: layout, copy, acciones, qué cambia
entre variantes (con/sin código, dormido/no existe) y cómo se ve en móvil.

**5c. Emails** — la plantilla base (anchos, colores con hex y ratio, tamaños de texto, padding, el
botón con sus medidas, la pila de fuentes de respaldo) y, para cada email: asunto, preheader, copy
completo, qué datos variables lleva (proyecto, dominio, hora, enlace, valor medido), la acción y cómo
se ve a 600 px, a 360 px, sin imágenes y con colores invertidos.

**6. Movimiento** — qué se anima, con qué duración y curva, y qué se apaga con
`prefers-reduced-motion`. Como mínimo, cómo abre, cierra o cambia cada uno de estos: acordeón,
pestañas y el indicador de la pestaña activa, select/dropdown, diálogo/sheet, la paleta de comandos,
el cambio de estado de una fila de despliegue, y el seguimiento en vivo del visor de logs.

**7. Orden de implementación** — la secuencia recomendada para construirlo, de tokens a componentes
base a secciones a páginas, con las dependencias entre pasos marcadas.

**8. Decisiones y trampas** — las decisiones de diseño que tomaste y por qué (para que el
desarrollador no las "arregle" por accidente), más lo que es fácil implementar mal: qué debe verse
idéntico entre secciones, qué espaciado es intencional aunque parezca inconsistente, qué no debe
convertirse en un componente compartido aunque se parezca a otro.

**9. Preguntas abiertas** — lo que no pudiste decidir por falta de información, con tu recomendación
para cada una.

Formato de todo el handoff: valores concretos, nunca adjetivos. "24px", no "espaciado generoso".
"#E6E8EB sobre #12151A, ratio 14.90:1", no "gris claro sobre gris oscuro".
