/** `audit_log.project` of a row about the account, not a project (a passkey removed, D055):
 * `-` can never be a project's name (lib/ops/rules.ts `PROJECT_RE`). Its own module so the
 * client's Auditoría table reads it without pulling in the schema. */
export const ACCOUNT_AUDIT_PROJECT = "-";
