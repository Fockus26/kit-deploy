# D022 · QA · A signed-in QA browser through `scripts/qa-session.ts`, only against this machine's `qa_<port>` database · Implemented

**Decision:** after `bun run qa:local -- --port <p>`, `bun scripts/qa-session.ts --port <p> [--demo]`
creates the `.env.test.local` account (EMAIL_TEST) if missing, opens a session with Better Auth's
`testUtils` helpers in a separate auth instance signed with qa-local's fixed secret, and writes a
Playwright `storageState` to `.qa/session.json` (never printed). `--demo` inserts demo projects
(`kd_hello`, `maranatha` and a 40-character name) in that database only. It refuses any URL that is not
127.0.0.1/localhost and exactly `/qa_<port>`, with no query.
**Why:** the dashboard has no sign-up and signs in by passkey (D003), which a headless browser cannot
do; the UI workers of phase 05 and wave-qa need a signed-in page without César.
**Discarded alternative:** a virtual WebAuthn authenticator in Playwright (CDP), which needs the enrolment
flow on every run and is slow and brittle; a QA-only sign-in route in the app, which is a back door in
the production build.
