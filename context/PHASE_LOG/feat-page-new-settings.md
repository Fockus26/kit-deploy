# feat/page-new-settings — fase 05 W11 (ola 3)

**Qué:** `/new` (formulario + token mostrado una vez desde el resultado de `createProjectAction`,
comandos `gh secret set` y `project pin`, "Ya lo guardé" lo borra del estado), `/settings` (Acceso:
passkeys en tabla, comando de enlace de alta, estado de TOTP y códigos; Alertas deshabilitada "Llega
en la fase 06"; Tokens: tabla + Revocar con ConfirmDialog + Nuevo token mostrado una vez; Auditoría:
DataTable paginada con `?antes=`), restyle de `/login` y `/enrol` (tarjeta 400 con el logo; login con
"Usar código de la app" / "Usar código de recuperación").

**Piezas nuevas:** `components/kit/token-once.tsx`, `components/kit/command-line.tsx`,
`components/ui/native-select.tsx`, token `--container-form-wide` (560px).

**Decisiones:** D041 (token solo en el estado de la acción; passkey nueva por enlace de alta), D042
(paginación de auditoría por enlace; códigos de login sobre un solo formulario).

**Verificado:** flujos Playwright contra build de producción (qa_4304): error de /new conserva lo
escrito, token visible una vez, no en la URL ni en el DOM tras "Ya lo guardé", foco gestionado;
nuevo token y revocar (botón deshabilitado hasta escribir el nombre, foco inicial en Cancelar, Esc
devuelve el foco); login con código erróneo limpia el código y no cambia la URL. axe 0 violaciones
claro/oscuro a 320/768/1440 + estados tras enviar; sin scroll horizontal a 320. typecheck, lint,
build, suite completa (845 pass, 0 fail). security-review sin hallazgos.

**Pendiente / para César:** CONTENT_CHECKLIST filas 32–34 (copy provisional de /new, tarjeta de
Alertas, textos de Ajustes/login). Sin regenerar códigos de recuperación ni contador en la capa.
