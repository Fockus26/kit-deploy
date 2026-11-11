# D018 · QA · Own phase track, infrastructure first (01 server … 09 QA); kit UI phases run inside phase 05 · Implemented

**Decision:** `phases/01…09` follow the brief's "Suggested phases" plus a final QA; the kit's UI phases
(tokens … responsive) live in `phases/ui/` and are the units of phase 05 (Dashboard).
**Why:** the platform has to work by CLI before it has a page; the kit's tracks assume a site from a design.
