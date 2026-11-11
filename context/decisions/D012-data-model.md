# D012 · Data · Postgres kit_deploy (kit-db) + Drizzle; secrets AES-256-GCM with /etc/kit-deploy/master.key · Pending

**Decision:** tables projects, deployments, previews, env_vars (ciphertext, iv, tag, secret flag, environment),
audit_log, domains, cron_jobs, cron_runs, deploy_tokens (hashed), metric_samples (rollups), alerts, plus Better
Auth's. Master key root-only, copied to César's password manager. Caddy files and containers are generated
from this database (`kit-deploy regenerate`).
**Why:** brief, non-functional "state is rebuildable" and "secrets encrypted at rest".
