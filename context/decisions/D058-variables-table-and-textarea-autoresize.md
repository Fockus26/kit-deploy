# D058 · Panel · Tabla de variables legible y textarea con autoresize · Confirmed (2026-11-18)

**Decision:** in Variables, the name (mono, weight 500) truncates at 28ch and the plain value at 40ch
in muted mono, both with the full text in `title`; secrets still show only fixed "••••••••" (D033),
the type stays a text badge (lock icon for Secreta), and the row actions never wrap. Every `Textarea`
grows with its content (`field-sizing: content`, a JS `scrollHeight` fallback where unsupported)
up to `max-h-80`, then scrolls inside; manual resize is off.
**Why:** long values stretched rows and wrapped buttons; a fixed 3-row box hid multi-line values.
**Discarded alternative:** a click-to-expand value row (more state for v1); `resize-y` handle (clashes
with autosize).
