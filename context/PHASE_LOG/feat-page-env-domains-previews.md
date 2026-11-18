# feat/page-env-domains-previews — fase 05 W9 (ola 3)

**Qué:** páginas Variables (`p/[project]/env`), Dominios (`p/[project]/domains`) y Previews
(`p/[project]/previews`) sobre `lib/panel/data` y las Server Actions existentes. Sin consultas ni
acciones nuevas.

**Archivos:** `app/(panel)/p/[project]/{env,domains,previews}/*`, `app/(panel)/p/[project]/_parts/action-notice.tsx`,
`components/kit/agent-down-notice.tsx` (aviso §5b reutilizable), `lib/panel/resource-labels.ts` (+ test),
D038, D039, changeset minor.

**Decisiones:** D038 (valor de la variable solo en el DOM, vaciado en cada envío; tres listas para
el tablist), D039 (select para elegir los registros DNS; quitar el dominio por defecto con `force`).

**Verificado:** axe 0 en las 3 páginas × claro/oscuro × 320/768/1440 y en el diálogo; 0 scroll
horizontal; teclado (tablist con flechas, diálogo con foco en Cancelar, Esc devuelve el foco, botón
destructivo deshabilitado hasta escribir el nombre); el valor secreto no queda ni en el campo ni en el
HTML tras un guardado rechazado; añadir dominio → la tarjeta DNS lo muestra; Comprobar ahora responde.
Sin kit-agent local: guardar variable y quitar dominio muestran el aviso de kit-agent caído.

**Pendiente / visto de pasada:** el log del servidor muestra `Date.now() while prerendering` en todas
las rutas del panel (también `/`), no viene de esta unidad. Editar la redirección de un dominio
existente queda en la CLI (la acción existe, sin UI en v1).
