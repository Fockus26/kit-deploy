# Page Inventory — kit-deploy

> Every page of the dashboard, its route, and which sections/components each one uses.
> All behind the session (D003) except `/login`. Built in phase 05.

| Page | Route | Sections it uses | Status | Notes |
|---|---|---|---|---|
| Login | `/login` | LoginPasskey, LoginTotp, RecoveryCodes | Pending | a bare version exists from phase 03 (D013 needs it) |
| Home | `/` | VpsStatus, ProjectList, OpenAlerts | Pending | main destination when logged in |
| Project | `/p/[project]` | ProjectHeader, MetricsRow, RecentDeployments, ActivePreviews, LiveLogs | Pending | |
| Deployments | `/p/[project]/deployments` | DeploymentsTable, DeploymentDetail | Pending | links to the Actions run |
| Previews | `/p/[project]/previews` | PreviewsList | Pending | active / sleeping (D017) |
| Variables | `/p/[project]/env` | EnvTabs, EnvTable, EnvForm, RebuildNotice | Pending | secrets write-only |
| Domains | `/p/[project]/domains` | DomainList, DnsInstructions, CertStatus | Pending | |
| Logs | `/p/[project]/logs` | LogTail, LogSearch | Pending | D014 |
| Databases | `/p/[project]/databases` | DatabaseList | Pending | `kit-db list/status` |
| Cron | `/p/[project]/cron` | CronJobs, CronRuns | Pending | phase 06 |
| New project | `/new` | NewProjectForm, TokenReveal | Pending | the deploy token is shown once |
| Settings | `/settings` | Passkeys, Alerts, DeployTokens, AuditLog | Pending | |
| 404 / 500 | — | StatusScreen | Pending | one 404 (all with session) |
| Preview sleeping / not found | served by Caddy | static HTML | Pending | phase 03, restyled in 05 |
