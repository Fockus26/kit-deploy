---
"kit-deploy": minor
---

La plantilla `deploy-vps.yml` no despliega hasta que el repo tenga `KIT_DEPLOY_ENABLED=true` (antes solo avisa, sin fallar), y `templates/MIGRATING.md` explica cómo pasar un proyecto de Vercel a kit-deploy.
