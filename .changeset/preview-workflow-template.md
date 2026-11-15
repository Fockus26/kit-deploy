---
"kit-deploy": minor
---

La plantilla `deploy-vps.yml` ahora crea una preview por cada PR (al abrirlo, con cada push y al reabrirlo) y la borra al cerrarlo. Los PRs de forks y de Dependabot se saltan con un aviso.
