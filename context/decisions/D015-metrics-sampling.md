# D015 · Data · Metrics: docker stats every 30 s + Caddy JSON access logs; rollups 1 min (48 h) and 1 h (30 days) · Confirmed (2026-11-17)

**Decision:** the agent samples CPU and memory per container against its limit and VPS disk/memory; requests
and 5xx per host come from Caddy's JSON access log. Stored as rollups in `metric_samples`.
**Why:** F9 without Prometheus/Grafana on an 8 GB machine.

**Implemented (2026-11-17, phase 05):** kit-agent `metrics.sample` (agent/metrics.ts), `kit-deploy metrics collect`
on `kit-deploy-metrics.timer` (every 30 s), `kit-deploy metrics <project>`, `metric_samples` (migration 0009) and
the dashboard's reader `lib/metrics/read.ts`. Shapes in D026, the access-log reading in D027.
