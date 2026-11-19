# D065 · QA · `GITHUB_API_BASE` points the repo list at a local fake GitHub, only on loopback · Implemented

**Decision:** `lib/github/repos.ts` reads `GITHUB_API_BASE` (`githubApiFromEnv`) and asks the
repo list (D061) there, but only when the server runs under `qa:local` (`QA_LOCAL=1`, set by
qa-local; never on the VPS) **and** the value is exactly `http://127.0.0.1:<port>`,
`http://localhost:<port>` or `http://[::1]:<port>` (optional trailing `/`, port 1–65535; no path,
query, user info or look-alike host; rebuilt from its parts, so `:04310` becomes `:4310`). Any
other value is ignored, logged once **without the value**, and `https://api.github.com` is used. The `Link: rel="next"` pages are still followed
only within that same base, and the cache is per token **and** base. The status-token client
(`lib/deploy/github.ts`) does not read it. The fake is `scripts/qa/github-fake.mjs` (node, no
deps, listens on 127.0.0.1): `GET /user/repos`, 130 `qa-org/…` repos (every third private;
default branches `main` / `develop` / `master`), 100 per page with a real `Link` header built
on the origin the client used, 401 without `Authorization: Bearer …` (never logged),
`--fail <status>` and `--slow <ms>`.

```bash
node scripts/qa/github-fake.mjs --port 4310          # [--fail 500] [--slow 6000]
GITHUB_API_BASE=http://127.0.0.1:4310 GITHUB_READ_TOKEN=github_pat_qafake \
  bun run qa:local -- --port 4301 --preview          # qa-local passes the environment through
```

**Why:** without it `qa:local` could only exercise the no-token fallback, never the combobox,
pagination or row 45's error hint. The read token travels to that base, so on the VPS a stray
or injected value must never send it to another host — and the VPS's PR previews also listen on
127.0.0.1 ports (D016), so loopback alone is not enough there: hence `QA_LOCAL=1` too (added by
the security review). Loopback-only, plain http (the fake has
no certificate), checked with a strict pattern instead of `new URL()` (which accepts user info
and normalises odd hosts).

**Discarded alternative:** any `http(s)` base (one stray env line would leak the token);
gating on `NODE_ENV !== "production"` (`qa:local --preview` runs the production build); editing `scripts/qa-local.ts` to start the
fake (the kit replaces that file).
