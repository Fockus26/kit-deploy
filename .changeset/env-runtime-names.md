---
"kit-deploy": patch
---

Las variables que configuran el runtime en vez de la app (`PATH`, `NODE_*`, `LD_*`, `*_PROXY`, `SSL_CERT_*`, `OPENSSL_*`, `UV_*`, `BUN_*`) ya no se pueden fijar: podían desviar el tráfico de un sitio y exponer sus secretos.
