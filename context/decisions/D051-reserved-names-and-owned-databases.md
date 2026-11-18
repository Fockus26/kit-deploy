# D051 · Data · Reserved project names; DATABASE_URL and db.status only for databases kit-deploy owns (root marker, `db adopt`) · Implemented

**Decision:**
1. **Reserved names.** No project may be called `kit_deploy`, `postgres`, `template0`, `template1`,
   `pgbouncer` or `scratch` (`RESERVED_PROJECTS`, `lib/ops/rules.ts`): refused by `assertProject`,
   the agent's protocol (every op with a `project`), `addProject`, the panel's Nuevo proyecto
   (Spanish message), `project add`, `project pin` (which also refuses `*_preview` now),
   `db create` and `db adopt`. `<name>_preview` stays refused by the suffix.
2. **Owned databases.** kit-agent injects the managed `DATABASE_URL` and `db.status` reports size,
   backup and failure lines **only** for a database with a root marker,
   `/etc/kit-deploy/dbs/<database>` (dir root 0700, file root 0600, content
   `created|adopted by kit-deploy <ISO date>`, no secret). It is read with `readFileFrom`
   (O_NOFOLLOW, regular file, ≤ 1 KiB): a symlink, a directory or a big file is no marker.
   - `db.create` checks both names first: one that already exists **without** the marker is
     `not_managed` and nothing is created (panel: "Ya existe una base con ese nombre que no creó
     kit-deploy…"); one it creates gets the marker; one with the marker is "already there".
   - Without the marker, `container.run` does not even call `kit-db url` (log
     `env.managed … reason: not_managed`), and `db.status` lists it in `unmanaged` (name and env
     only).
   - `kit-deploy db adopt <project> [--yes]` (root over ssh, like `project pin`): a registered
     project only; it asks the agent which of `<project>` / `<project>_preview` exist unmanaged,
     prints them and writes their markers only with `--yes`.
3. **Release.** `infra/update.sh` is unchanged and nothing existing breaks: kd_hello, the only
   project on the VPS, has no database today (phase 05 never created one), so no one-time adopt is
   needed. If `kit-deploy db status kd_hello` ever shows "not managed by kit-deploy", that database
   was made by hand: `kit-deploy db adopt kd_hello --yes` after checking it is kd_hello's.
   maranatha (phase 07) brings its database from before: its migration runs `db adopt maranatha`.
**Why:** phase 05's security review (M2): a project's name is its kit-db database's, kit-db serves
every database on the central Postgres, and names were only checked by format, so a project named
`kit_deploy` (the platform's own database) or like another client's database got that URL in its
containers and its status in the panel. The web app can write the projects table, so the agent
cannot trust it: ownership lives in a root file only kit-agent (on create) and root (on adopt) write.
**Discarded alternative:** a deny-list alone (does not cover other clients' databases, whose names
nobody knows in advance); an `owned` column in `projects` (the web app writes that table, which is
exactly what the agent must not trust); having `db.create` adopt an existing database silently
(that is the takeover itself); auto-adopting in `update.sh` (it cannot know whose a database is).
