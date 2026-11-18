# D040 · UI · Logs: seguimiento en vivo y "Cargar más" por dos route handlers finos sobre logsTail / logsSearch · Implemented (2026-11-18)

**Decision:** la página Logs sigue en vivo (hoy, sin texto) consultando `GET /p/<proyecto>/logs/tail`
cada 2 s mientras está en "Siguiendo", y "Cargar más" de una búsqueda (otro día o con texto) consulta
`GET /p/<proyecto>/logs/search?before=<cursor>`. Ambos son envoltorios finos de `logsTail` / `logsSearch`
de `lib/panel/data`: comprueban la sesión (sin sesión, 401 JSON, nunca el redirect de `panelUser()`),
que el proyecto exista (404) y validan env / día / nivel / texto / cursor con las mismas formas del
agente (400); kit-agent caído es 503 `{ unavailable: "agent" }`. "Descargar" se arma en el navegador
con lo que hay en pantalla (`<ts> <NIVEL> <línea>`), sin ruta. Las horas del visor son UTC (las del agente).
**Why:** la capa de datos del panel (D032) solo se llama desde el servidor y la página no puede pedirle
líneas nuevas sin una petición; un Server Action no sirve para un sondeo (se serializan y no son GET).
Bases de datos no necesita ruta: `createDatabasesAction` ya existe. La columna de conexiones no está (D035).
**Discarded alternative:** que "Cargar más" navegue con `?before=` (reemplaza el resultado en vez de
añadirlo y pierde el scroll) y una sola ruta para los dos usos (mezcla un sondeo barato con una búsqueda
que lee un día entero y complica validar).
