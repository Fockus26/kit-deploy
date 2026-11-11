# Phase 09 — Final QA ("Done when")

Every item of the brief's "Done when", with evidence in `PHASE_LOG/09-final-qa.md`:

- [ ] A PR on a test project gets its preview URL in the PR in < 5 min, behind the login, and loses it on close.
- [ ] A merge deploys with no failed request during the switch (load test during the deploy).
- [ ] A rollback takes < 30 s and needs no build.
- [ ] A variable can be set from the page and from `ssh kit-vps kit-deploy env set`, is never readable
      afterwards if secret; `env pull` writes a working `.env.local`.
- [ ] A domain added from the page serves HTTPS with no manual step besides the DNS record.
- [ ] Rebooting the VPS brings every site back without touching anything.
- [ ] With kit-deploy stopped, every site still answers.
- [ ] `nmap` from outside sees only 22, 80, 443 and 6432.
- [ ] `certbot renew --dry-run` passes with Caddy running.
- [ ] The kit has the workflow template and its `UPDATES.md` entry.

Plus `functional-qa` (login, variables, deploy/rollback, domains) and `design-qa` of the dashboard
(the version QA). Then the release PR (Changesets) that César merges.
