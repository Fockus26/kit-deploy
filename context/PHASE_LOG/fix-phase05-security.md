# fix/phase05-security (W14, fase 05) — PR #61

**Qué:** arreglos de la revisión de seguridad de la fase 05.
- **M1 (D050):** los cambios de dominio y el timer de domain check llaman a `rewriteSiteFile` (solo reescribe el Caddyfile). `kit-deploy regenerate` sigue arrancando lo parado y avisa.
- **M2 (D051):**
  - `RESERVED_PROJECTS` se rechaza en todas las capas.
  - Marcador root en `/etc/kit-deploy/dbs/<base>`. Lo escribe `db.create` y lo exige `DATABASE_URL` / `db.status`.
  - Nuevo `kit-deploy db adopt <project> --yes` (root).
- **L1:** el certificado se lee con `readFileFrom`, con tope de 64 KiB.
- **L3:** `Limiter` 2/8/10 s en `logs.tail` y `logs.search`.

**IDs:** se reservaron D047–D048, pero main los usó en la fase 06 (alertas y cron) y D049 la toma `feat/images-prune`, así que quedaron D050–D051.

**Verificado:** typecheck, biome, `bun run test` (994 pass, 0 fail), `build:agent`, `build:cli`, security-review (nada con confianza ≥ 7).
**No verificado:** el VPS.

**Backlog:**
- L2 y L4.
- `backups.status`, accesible desde el socket del grupo (misma clase que L2).
- `kit-db create` reinicia la contraseña de un rol que existía sin su base.
- Los marcadores nunca se borran.
- `platformCerts` sigue leyendo `/etc/letsencrypt/live/...` con `readFile`, que sigue symlinks. Es correcto: certbot usa symlinks ahí y la ruta es fija.
