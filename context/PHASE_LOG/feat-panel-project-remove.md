# feat/panel-project-remove (W2, tanda 2026-11-22)

**Qué:** Eliminar proyecto desde la cabecera del proyecto (botón "Eliminar" en md+, "Eliminar
proyecto" en Más acciones), con el nombre escrito y un código TOTP fresco. Mismo orden que
`kit-deploy project rm --yes` (D059): ahora ambos llaman a `lib/ops/project-remove.ts`
`removeProject`. Antes de tocar filas, un dry run de kit-agent (si no responde, no se borra nada).
Éxito o resultado parcial → Inicio con `?eliminado=<p>` (D070).

**Decisiones:** D069 (eliminar desde el panel), D070 (aviso en Inicio, parcial → CLI).
**Archivos:** lib/panel/totp-guard.ts (compartido con W1, idéntico), lib/ops/project-remove.ts,
cli/project-commands.ts, lib/panel/schemas.ts (projectRemoveSchema), lib/panel/actions/project-remove.ts,
lib/panel/project-remove-runtime.ts, app/(panel)/actions/project-remove.ts, lib/panel/removed-notice.ts,
components/panel/{remove-project-dialog,removed-project-notice,project-actions}.tsx, app/(panel)/page.tsx,
tests/unit/project-remove-panel.test.ts.
**CONTENT_CHECKLIST (provisional):** 49 textos del diálogo; 50 errores de la acción
(PROJECT_REMOVE_COPY); 51 aviso de Inicio (removed-notice.ts).
**Sin verificar en navegador:** QA al final (sin servidor, sin build local en esta tanda).
