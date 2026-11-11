# D015 · Data · Metrics: docker stats every 30 s + Caddy JSON access logs; rollups 1 min (48 h) and 1 h (30 days) · Pending

**Decision:** the agent samples CPU and memory per container against its limit and VPS disk/memory; requests
and 5xx per host come from Caddy's JSON access log. Stored as rollups in `metric_samples`.
**Why:** F9 without Prometheus/Grafana on an 8 GB machine.
