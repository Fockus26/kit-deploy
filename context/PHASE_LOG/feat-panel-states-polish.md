# feat/panel-states-polish (W12) — 2026-11-17

- Estados: 404 (root + panel), 500 (`error.tsx`, digest), global-error, Caddy dormido/no existe
  restyled (system-ui, padding 16 en móvil; textos y checks de infra/test intactos).
- Un h1 (nombre del proyecto), sub-páginas h2; EmptyState `level`; sidebar "Proyectos" ya no es h2.
- Un solo aviso de kit-agent (`components/kit/agent-down-notice.tsx`, `retryHref`); `components/panel/agent-down.tsx` borrado.
- LogViewer `follow={false}`; salidas animadas (dropdown/Sheet/AlertDialog); el Sheet de despliegue
  se mantiene montado 200 ms al cerrar.
- Guardia `scripts/qa/panel-reflow.mjs`: main antes = 154 vistas, 0 con scroll horizontal; rama = 154, 0.
  axe (wcag2a/aa/21aa) 12 rutas x light/dark x 320/768/1440 = 0 violaciones.
- Audit de loading: todas las rutas tienen Suspense + SkeletonCard (Inicio, Ajustes, proyecto y sus 7 pestañas);
  /new es estático.
- No verificado en vivo: 500 y global-error (no hay forma de provocarlos sin romper código; probados por tipos + unit de digestOf/StatusScreen).
