# feat/agent-logs (fase 05, ola 1, W2) — PR #44

- D014 implementada y Confirmed; D024 (API de Docker por socket, no `docker logs -f`), D025 (50 MiB/proyecto/día).
- agent/logs.ts + agent/logs-system.ts; ops logs.tail / logs.search; CLI kit-deploy logs (cli/logs-commands.ts).
- Verificado: 635 tests, typecheck, lint, build, build:agent, build:cli; security-review sin hallazgos.
- Pendiente: probar el follow real contra Docker en el ship de la fase.
- Ola 2 (API/página Logs): sondear logs.tail como hace `-f`; search pagina con `before` = `next`.
