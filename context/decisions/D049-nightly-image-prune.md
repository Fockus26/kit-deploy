# D049 · Nightly jobs · Image prune keeps 5 per pinned repository; the sweep and the logs already exist · Confirmed (2026-11-18)

**Decision:** phase 06's nightly jobs are three, and only one is new. (1) **Images:** `kit-deploy
images prune` (root, `kit-deploy-images-prune.timer` at 04:45 + up to 15 min, after kit-db's
backups and the 04:00 preview sweep) asks kit-agent's new `images.prune` op to keep, per
repository pinned in `/etc/kit-deploy/images/` (the root-owned list of what kit-deploy pulls), the
5 newest images and every image any container references (running or stopped: a stopped one is a
rollback target, matched by tag and by image id); the rest is `docker image rm` without `-f`, so
Docker refuses anything still in use and the refusal is a warning. Images of repositories that are
not pinned (gaby, evolution_*, the dashboard's node image) are never looked at. (2) **Closed
previews:** already swept nightly by `kit-deploy preview sweep` (phase 03 U10). (3) **Logs:**
already gzipped after their day and removed after 14 days by kit-agent's rotation (D014).
**Why:** brief, phase 06 scope "prune images (keep 5 per project), sweep closed previews, gzip and
expire logs"; one image of a Next.js site is 200–400 MB and every merge and PR push pulls one.
**Discarded alternative:** `docker image prune -a --filter until=…` (removes any unused image on
the VPS, the unrelated projects' too); keeping N per project by deployments rows (the database is
writable by the web app; the pins are root's).
