# feat/qa-github-fake (W10) — PR #78

- `GITHUB_API_BASE` in lib/github/repos.ts (`githubApiFromEnv`): it is accepted only as loopback http with a port and with `QA_LOCAL=1`. Otherwise it is ignored and logged once without its value. The cache is per token and base.
- `scripts/qa/github-fake.mjs`: 130 `qa-org/…` repos, Link pagination, 401 without auth, `--fail` and `--slow`.
- Fix: «Usar «owner/repo»» no longer keeps the previously listed repo's branch (`branchAfterPick`, pure + tests). Changeset patch.
- D065. Verified e2e on qa:local --preview 4301: 130 options, develop → main, row 45 hint with --fail 500 and --slow 6000.
- Security review (subagent): no High or Medium findings. The Low ones in this unit are applied. Redirects in `githubRequest` are left for later.
- Merged origin/main (#77, D066: the form in two columns). The conflict in new-project-form.tsx is resolved.
