# feat/backup-codes-totp (W1, tanda 2026-11-22)

- Ajustes › Códigos de recuperación: "Ver códigos" y "Generar nuevos", cada uno con un diálogo que pide
  el código de 6 dígitos de la app y lo comprueba en el servidor (orden de D055). D067, D068.
- `lib/panel/totp-guard.ts` (idéntico al del brief) compartido con Eliminar passkey; `passkey-runtime.ts` lo usa.
- Auditoría `backup_codes.view` / `backup_codes.regenerate` (proyecto `-`), migración `0017_backup_codes_audit`.
- La lista de códigos del alta se extrajo a `components/auth/recovery-codes.tsx` (mismo comportamiento).
- CONTENT_CHECKLIST (no editado por el worker, filas reservadas):
  - 46 · textos de los diálogos Ver/Generar (`app/(panel)/settings/backup-codes-controls.tsx` `TEXT` y `Codes`) · provisional
  - 47 · mensajes de error del diálogo (`lib/panel/actions/backup-codes.ts` `BACKUP_CODES_COPY.noTotp`; el resto es el de passkeys) · provisional
  - 48 · texto de la tarjeta Códigos de recuperación (`app/(panel)/settings/page.tsx`) · provisional
- Acción manual: la migración 0017 se aplica en el próximo ship.
