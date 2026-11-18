# feat/page-logs-databases — páginas Logs y Bases de datos (fase 05 W10 · changeset minor)

## Status
en revisión (2026-11-18)

## What was done
- `p/[project]/logs/page.tsx`: barra de filtros GET (despliegue, día de 14, texto literal, nivel) y
  `components/logs/logs-explorer.tsx`: seguimiento en vivo (hoy sin texto) con sondeo cada 2 s,
  búsqueda con "Cargar más" por cursor `before`, Descargar `.log` armado en el navegador.
- Dos route handlers finos (D040): `logs/tail/route.ts` y `logs/search/route.ts`.
- `p/[project]/databases/page.tsx`: DataTable sin columna de conexiones (D035), Backup Listo/Aviso
  (< 36 h y sin fallo), "Crear base" con `createDatabasesAction`, vacío con EmptyState.
- `lib/kit/logs-page.ts` + `tests/unit/logs-page.test.ts` (reglas puras), `components/ui/native-select.tsx`.

## Pending / seen
- Copy provisional: filas 30–31 de CONTENT_CHECKLIST (textos de las dos páginas).
- `LogViewer` (W5) muestra "En pausa / Reanudar" también en una búsqueda estática.
- `/p/<desconocido>/…` responde 200 con el 404 en streaming (lo arregla W8 en el layout).
