// Load test for a site kit-deploy serves. k6 runs it in Docker through scripts/load-test.sh, which
// validates every value below before passing it in; read that file for the usage.
//
// Open model (constant-arrival-rate): RATE requests start every second whatever the latency, as
// real visitors do. A closed loop (N users in a row) would slow down with the server and hide it.
// Thresholds are the ones from the "$12 server" challenge: p95 < 500 ms, p99 < 1 s, errors < 1 %.
// STRICT=1 (during a deploy, brief › Done when) allows zero failed requests instead.
import { check } from "k6";
import http from "k6/http";

const target = __ENV.TARGET.replace(/\/$/, "");
const paths = (__ENV.PATHS || "/").split(",");
const rate = Number(__ENV.RATE || "50");
const strict = __ENV.STRICT === "1";

// RESOLVE pins the host to an IP so the run measures the site, not this machine's resolver:
// phase 02's first run lost 8 requests in a 4 s window to the resolver, none reached Caddy.
const host = /^https?:\/\/([^/:]+)/.exec(target)[1];
const hosts = __ENV.RESOLVE ? { [host]: __ENV.RESOLVE } : {};

export const options = {
  hosts,
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    site: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: __ENV.DURATION || "60s",
      preAllocatedVUs: rate,
      // Under the p99 threshold each VU does at least one request a second: twice the rate
      // keeps up, and more would only mean the site is too slow, which dropped_iterations says.
      maxVUs: Math.max(rate * 2, 20),
    },
  },
  thresholds: {
    http_req_failed: [strict ? "rate==0" : "rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    // Requests k6 could not even start because every VU was waiting: the site fell behind.
    dropped_iterations: ["count==0"],
  },
};

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  // One hop per request: a redirect (www → apex, D028) is measured as itself, not followed.
  const res = http.get(`${target}${path}`, {
    redirects: 0,
    tags: { name: path },
  });
  check(res, { "status < 400": (r) => r.status > 0 && r.status < 400 });
}
