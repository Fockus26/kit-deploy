# D038 · UI · The Variables form keeps the value only in the DOM and empties it on every submit; tabs carry the three lists · Implemented (2026-11-17)

**Decision:** The value textarea is uncontrolled (a ref, never React state, never `defaultValue`
from a result): the submit handler empties it as soon as the FormData leaves, on success and on
error, and React's form reset does it again. Name, Secreta and Entornos are controlled so a
refused save keeps them. "Editar" (plain) writes the plain value already on the page into the
field through the ref; "Reemplazar" (secret) leaves it empty. `autocomplete="off"`,
`spellcheck=false`, password-manager opt-outs. The page reads the three environments at once
(`envList` × 3) so the EnvTabs are a real `tablist` with counters and switch without a request.
**Why:** HANDOFF §8 "the UI has no path to show a secret"; a value in state survives re-renders and
dev tools; one list per tab avoided a query string the tablist pattern does not use.
**Discarded alternative:** a controlled textarea cleared after the result (the value lives in
state until then); a tab per URL `?env=` (links, not a tablist, against HANDOFF §2).
