# feat/repo-picker (W6, tanda 2026-11-18 ola 2)

- Nuevo proyecto: "Repositorio" es un combobox (Popover + Command, cmdk) sobre los repos de César, leídos en el servidor con GITHUB_READ_TOKEN (D061, D062).
- install.sh --github-read-token → /etc/kit-deploy/github-read.env (0600 root); update.sh lo pasa a la web; ship.sh acepta el flag.
- Sin token o con error: el input owner/repo de siempre con una ayuda (filas 44–45).
- /new es dinámica: el formulario espera a la lista tras Suspense (caché 5 min).
- Tests: github-repos.test.ts (24); install test sección 5b. Build: lo corre CI.
- Pendiente: César crea el token (All repositories, Metadata: read) y lo escribe en el ship de la tanda.
