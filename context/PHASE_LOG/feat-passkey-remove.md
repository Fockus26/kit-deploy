# feat/passkey-remove (tanda 2026-11-18, ola 1, W3)

- D055 (eliminar passkey solo con código TOTP fresco verificado en el servidor; sin TOTP, nunca), D056 (las sesiones siguen; la passkey ya no entra).
- Ajustes › Passkeys: "Eliminar" por fila → diálogo con el código de 6 dígitos (se queda abierto si el código falla). El foco va al aviso de la tabla tras borrar.
- Servidor: `auth.api.verifyTOTP` con la cookie de la petición (sin ruta pública nueva); DELETE con id + user_id y fila `passkey.remove` (proyecto `-` = cuenta) en una transacción. Migración 0016 (sobre la 0015 de W5) amplía el check de `audit_log_action`.
- `memoryTotpGuard`: 5 intentos / 15 min por usuario, cuenta el intento antes de comprobar (ráfagas en paralelo no pasan), código gastado 2 min. Línea `kit-deploy-auth: failed sign-in … path=/panel/passkey-remove status=401|429`.
- Medido: Better Auth llamado en servidor no limita, no bloquea la cuenta ni recuerda códigos usados (el test lo demuestra).
- Sin servidor ni QA en la unidad: lo prueba wave-qa tras la ola 2.
