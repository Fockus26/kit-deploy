# D016 · Infra · Every container binds 127.0.0.1:<port> (20000–29999), never 0.0.0.0 · Pending

**Decision:** kit-deploy assigns each deployment a loopback port in 20000–29999; Caddy reverse-proxies to it.
Checked from outside with `nmap` at the close of phase 01 and in phase 09 (only 22, 80, 443, 6432).
**Why:** Docker writes its own iptables rules and publishes ports past ufw (brief, Traps).
