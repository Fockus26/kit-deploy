# feat/project-remove (W5, tanda 2026-11-18 ola 1)

- `kit-deploy project rm <project> [--yes]` (root): sin `--yes` lista y sale 0; con `--yes` borra filas
  (cascade + alertas cerradas sin correo + audit `project.remove`) y luego kit-agent `project.remove`
  (Caddy en un solo validate+reload con rollback → contenedores con etiquetas → imágenes del pin sin uso
  → pin al final si nada falló). Bases kit-db y marcadores se conservan; imprime `kit-db drop`.
- D059, D060. Migración 0015 (solo el CHECK de audit_log). Changeset minor. Sin fila 43 (el panel
  muestra la acción como código).
- Verificado: 21 pruebas nuevas (agent + CLI), typecheck, biome, suite completa. Store contra Postgres:
  prueba opt-in escrita (KIT_DB_TEST_URL), no ejecutada (sin Docker).
- Pendiente: el orquestador lo corre en kd_hello en el VPS tras el ship, con el OK de César.
