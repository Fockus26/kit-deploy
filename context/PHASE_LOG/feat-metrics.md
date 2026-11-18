# feat/metrics — D015 métricas: metric_samples, metrics.sample, collect, metrics <proyecto> (PR #45 · changeset minor)

## Status
in review (2026-11-17)

## What was done
- Op `metrics.sample` del agente (`agent/metrics.ts`): docker stats de los contenedores gestionados, /proc, df y el access log de Caddy leído de forma incremental (estado en /var/lib/kit-deploy/metrics). Nuevo método `Deps.readFileFrom`.
- Migración 0009 `metric_samples` (D026) y `lib/metrics/collect.ts`: fusión por minuto, minutos de peticiones escritos una sola vez, rollups de 1 h, poda 48 h / 30 días. `store.ts` es la implementación con drizzle.
- CLI `kit-deploy metrics collect` en `kit-deploy-metrics.timer` (30 s) y `kit-deploy metrics <proyecto>`. `lib/metrics/read.ts` sirve al panel.

## Verified (and how)
- bun test: 642 pass, 0 fail. typecheck, lint, build:agent y build:cli en verde. security-review sin High ni Critical; se corrigió el caso de un host `constructor`.

## Not verified
- La migración contra Postgres y el SQL de store.ts/read.ts (sin Docker ni PGlite). test:infra:install (lo corre el orquestador). Nada en el VPS.

## Decisions
- D026 — filas por (scope, subject, resolution, bucket), minutos de peticiones escritos una sola vez (decisions/D026-metric-samples-rows.md)
- D027 — lectura del access log con offset, rotación y minutos cerrados (decisions/D027-access-log-reading.md)
- D015 → Confirmed

## Actions for César
- Ninguna hasta el envío de la fase: update.sh instala y activa el timer, y la migración 0009 entra con la release.

## Seen in passing (not touched)
- Cualquier miembro del grupo kit-deploy, incluido el contenedor web, puede llamar `metrics.sample` y consumir minutos del collector (solo afecta la precisión).
