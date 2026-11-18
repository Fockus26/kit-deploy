# feat/ui-components (fase 05, ola 2, W5)

- D030 (componentes presentacionales en components/kit, TanStack Table core + Recharts), D031 (LogViewer salta al final sin animación).
- Componentes: StatusBadge, StatusDot, CopyValue, RelativeTime, Meter, Sparkline, MetricCard, DataTable, ConfirmDialog, LogViewer, Field*, Notice, EmptyState, SkeletonCard, Tabs; Button con destructive-text / destructive-solid / loading.
- Galería dev: /dev/componentes (404 en producción). QA con qa:local + qa-session: axe claro/oscuro 320/1440 sin violaciones, teclado de diálogo/tabs/copiar/log, reduced motion.
- Arreglo de paso: `cn` (tailwind-merge) no conocía la escala tipográfica y quitaba text-primary-foreground del Button sm.
- Para las páginas (ola 3): columnas de DataTable en ámbito de módulo (`dataTableColumns<T>()`); el RelativeTime acepta `now` fijo.
