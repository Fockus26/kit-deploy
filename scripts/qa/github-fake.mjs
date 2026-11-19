/**
 * A fake GitHub for QA (D065): only `GET /user/repos`, the call behind Nuevo proyecto's repo
 * picker (lib/github/repos.ts, D061). 130 fake repos (`qa-org/…`, some private, default branches
 * `main` / `develop` / `master`), 100 per page with a real `Link: <…>; rel="next"` header. A
 * request without `Authorization: Bearer …` gets 401. The header's value is never logged.
 *
 *   node scripts/qa/github-fake.mjs --port 4310 [--fail <status>] [--slow <ms>] [--count <n>]
 *
 * --fail 500   every request answers that status (the picker falls back to the plain input
 *              with "No se pudo cargar la lista…", CONTENT_CHECKLIST row 45).
 * --slow 6000  waits that long before answering (past the list's 5 s timeout: same fallback).
 *
 * Then, in another terminal (qa-local passes the environment through to the server):
 *   GITHUB_API_BASE=http://127.0.0.1:4310 GITHUB_READ_TOKEN=github_pat_qafake \
 *     bun run qa:local -- --port 4301 [--preview]
 * The panel only accepts a loopback `http://127.0.0.1|localhost|[::1]:<port>` base; any other
 * value is ignored and GitHub is used. Listens on 127.0.0.1 only. Runs with node, no deps.
 */
import { createServer } from "node:http";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg("port", "4310"));
const fail = arg("fail", null) ? Number(arg("fail", null)) : null;
const slowMs = Number(arg("slow", "0"));
const count = Number(arg("count", "130"));
const MAX_PER_PAGE = 100;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("--port must be 1-65535");
  process.exit(2);
}

const BRANCHES = ["main", "develop", "main", "master", "main"];
const START = Date.UTC(2026, 10, 18, 12, 0, 0);

/** Most recently pushed first, as `sort=pushed` returns them. */
const REPOS = Array.from({ length: count }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  return {
    id: 900_000 + i,
    name: `repo-${n}`,
    full_name: `qa-org/repo-${n}`,
    private: i % 3 === 1,
    owner: { login: "qa-org" },
    description: `Repositorio de prueba ${n}`,
    default_branch: BRANCHES[i % BRANCHES.length],
    pushed_at: new Date(START - i * 3_600_000).toISOString(),
  };
});

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://fake.invalid");
  const done = (status) =>
    console.log(`${req.method} ${url.pathname}${url.search} -> ${status}`);

  if (slowMs > 0) await new Promise((r) => setTimeout(r, slowMs));

  if (req.method !== "GET" || url.pathname !== "/user/repos") {
    done(404);
    return send(res, 404, { message: "Not Found" });
  }
  if (!/^Bearer \S+$/.test(req.headers.authorization ?? "")) {
    done(401);
    return send(res, 401, { message: "Requires authentication" });
  }
  if (fail) {
    done(fail);
    return send(res, fail, { message: "Fake failure" });
  }

  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Number(url.searchParams.get("per_page")) || 30),
  );
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const last = Math.max(1, Math.ceil(REPOS.length / perPage));
  const body = REPOS.slice((page - 1) * perPage, page * perPage);

  // Links on the same origin the client used, so `nextPath` follows them (same base only).
  const origin = `http://${req.headers.host ?? `127.0.0.1:${port}`}`;
  const link = (p) => {
    const q = new URLSearchParams(url.searchParams);
    q.set("page", String(p));
    return `${origin}/user/repos?${q}`;
  };
  const links = [];
  if (page < last) links.push(`<${link(page + 1)}>; rel="next"`);
  links.push(`<${link(last)}>; rel="last"`);

  done(200);
  send(res, 200, body, { Link: links.join(", ") });
});

server.listen(port, "127.0.0.1", () => {
  const mode = fail ? ` fail=${fail}` : slowMs ? ` slow=${slowMs}ms` : "";
  console.log(
    `GitHub fake ready: http://127.0.0.1:${port} (${REPOS.length} repos${mode})`,
  );
});
