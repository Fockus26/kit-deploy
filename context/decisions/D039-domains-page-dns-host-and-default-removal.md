# D039 · UI · Dominios: a select picks whose DNS records are shown; removing the default host is allowed with its warning · Implemented (2026-11-17)

**Decision:** "Registros DNS para <host>" shows the host picked in a "Ver los registros de"
select (only with more than one domain); without a pick, the last one added, else the first
non-default one waiting for DNS, else the first. Quitar on the default `<project>.fockus.dev`
sends `force` (like `domain rm --force`): the dialog says it is the default one and the typed host
is the confirmation; the server still refuses removing the last domain that serves the site. The
redirect is chosen when adding; changing it later stays in the CLI (`domain redirect`) for v1.
**Why:** HANDOFF §3 does not say how a host is selected; a native select is keyboard- and
screen-reader-ready with no new pattern, and the table keeps HANDOFF's columns.
**Discarded alternative:** clickable rows with `aria-selected` (a selection pattern for one card);
hiding Quitar on the default host (the CLI allows it, the server already guards the last host).
