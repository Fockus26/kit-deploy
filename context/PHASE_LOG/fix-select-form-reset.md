# fix/select-form-reset (W9) — 2026-11-19

- Alto del QA funcional de la tanda 2026-11-18: el select de un `<form action>` volvía a su primer valor tras un envío rechazado (React `form.reset()` + Radix Select 2.4.1 escucha el reset).
- D064: `components/kit/option-select.tsx` ignora el `onValueChange` que Radix dispara durante el `reset` del formulario (listener en captura sobre el documento, limpiado en microtask) y envía el valor desde un `<input type="hidden">` propio; Radix ya no recibe `name`.
- Guardia: `scripts/qa/select-after-rejected-submit.mjs` (dos envíos rechazados; compara lo mostrado y el cuerpo de la Server Action; no escribe en la base). FAIL en 7c5e889, PASS con el arreglo; repro del QA igual.
- Verificado: suite 1072/0, typecheck, biome, build de producción (qa:local --preview), axe 0 en /new y /settings (claro/oscuro, 320/1280), teclado, filtros GET de Logs.
