import { describe, expect, test } from "bun:test";
import { dispatch } from "../../agent/dispatch";
import { CERT_MAX_BYTES } from "../../agent/domains";
import { Agent } from "../../agent/ops";
import { CADDY_CERTS_DIR } from "../../lib/core/constants";
import { fakeDeps } from "./agent-fakes";

/** Self-signed, SAN shop.example.com, O=Test CA, notAfter 2036-11-15T01:59:15Z (key discarded). */
const SHOP_PEM = `-----BEGIN CERTIFICATE-----
MIIByzCCAXKgAwIBAgIUU7FuscJMiyZExzcAnWvmucs2+5gwCgYIKoZIzj0EAwIw
LTEQMA4GA1UECgwHVGVzdCBDQTEZMBcGA1UEAwwQc2hvcC5leGFtcGxlLmNvbTAe
Fw0yNjExMTgwMTU5MTVaFw0zNjExMTUwMTU5MTVaMC0xEDAOBgNVBAoMB1Rlc3Qg
Q0ExGTAXBgNVBAMMEHNob3AuZXhhbXBsZS5jb20wWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAASd883n5uaaKVIpm2NNZcnFr6qyZAX5HJOqZcrn4wWAsLz8L2tV9FZi
IfWxdS930jM2kDXiVeFf6UCQKCxWPvTio3AwbjAdBgNVHQ4EFgQUi7jnm1Aw/twu
ZbpXZVPk3zz5kNAwHwYDVR0jBBgwFoAUi7jnm1Aw/twuZbpXZVPk3zz5kNAwDwYD
VR0TAQH/BAUwAwEB/zAbBgNVHREEFDASghBzaG9wLmV4YW1wbGUuY29tMAoGCCqG
SM49BAMCA0cAMEQCID+7/3pXVjOmoFeVTGIEJTDvLAZY148FODAqGc53GmnzAiBM
tCXqomUsKic2Z/dtIVbGcX9lBMVAU8Hn5RxKPIzMeQ==
-----END CERTIFICATE-----
`;

const LE = `${CADDY_CERTS_DIR}/acme-v02.api.letsencrypt.org-directory`;
const ZERO = `${CADDY_CERTS_DIR}/acme.zerossl.com-v2-dv90`;

function setup() {
  const f = fakeDeps();
  const agent = new Agent(f.deps);
  const send = (req: unknown) => dispatch(agent, f.deps, JSON.stringify(req));
  return { ...f, send };
}

const certStatus = (host: string) => ({
  id: "c1",
  op: "cert.status",
  params: { host },
});

describe("cert.status", () => {
  test("reads the certificate Caddy stored: expiry and issuer, nothing else", async () => {
    const { send, files } = setup();
    files.set(`${LE}/shop.example.com/shop.example.com.crt`, SHOP_PEM);
    files.set(`${LE}/shop.example.com/shop.example.com.key`, "SECRET KEY");
    const res = await send(certStatus("Shop.Example.com"));
    expect(res).toEqual({
      id: "c1",
      ok: true,
      result: {
        notAfter: "2036-11-15T01:59:15.000Z",
        issuer: "Test CA",
        source: "acme-v02.api.letsencrypt.org-directory",
      },
    });
    expect(JSON.stringify(res)).not.toContain("SECRET");
  });

  test("ZeroSSL's directory too; null when Caddy has none yet", async () => {
    const { send, files } = setup();
    expect(await send(certStatus("shop.example.com"))).toMatchObject({
      ok: true,
      result: null,
    });
    files.set(`${ZERO}/shop.example.com/shop.example.com.crt`, SHOP_PEM);
    expect(await send(certStatus("shop.example.com"))).toMatchObject({
      ok: true,
      result: { source: "acme.zerossl.com-v2-dv90" },
    });
  });

  test("a file that does not parse, or a certificate for another name, is no certificate", async () => {
    const { send, files } = setup();
    files.set(`${LE}/other.example.com/other.example.com.crt`, SHOP_PEM);
    files.set(`${LE}/bad.example.com/bad.example.com.crt`, "not a pem");
    for (const host of ["other.example.com", "bad.example.com"])
      expect(await send(certStatus(host))).toMatchObject({
        ok: true,
        result: null,
      });
  });

  test("L1: a symlink is never followed, and a file over the cap is no certificate", async () => {
    const { send, files, symlinks } = setup();
    // Caddy's directory pointing a host's .crt at a file the agent should never read.
    files.set("/etc/kit-deploy/master.key", SHOP_PEM);
    symlinks.set(
      `${LE}/shop.example.com/shop.example.com.crt`,
      "/etc/kit-deploy/master.key",
    );
    expect(await send(certStatus("shop.example.com"))).toMatchObject({
      ok: true,
      result: null,
    });
    files.set(
      `${ZERO}/shop.example.com/shop.example.com.crt`,
      SHOP_PEM + "x".repeat(CERT_MAX_BYTES),
    );
    expect(await send(certStatus("shop.example.com"))).toMatchObject({
      ok: true,
      result: null,
    });
    // Within the cap: read.
    files.set(`${ZERO}/shop.example.com/shop.example.com.crt`, SHOP_PEM);
    expect(await send(certStatus("shop.example.com"))).toMatchObject({
      ok: true,
      result: { source: "acme.zerossl.com-v2-dv90" },
    });
  });

  test.each([
    "db.fockus.dev",
    "deploy.fockus.dev",
    "kd-hello-pr-3.preview.fockus.dev",
    "../../etc/shadow",
    "a/b.example.com",
  ])("refuses %s before reading anything", async (host) => {
    const { send, files } = setup();
    const reads: string[] = [];
    const orig = files.get.bind(files);
    files.get = (k: string) => {
      reads.push(k);
      return orig(k);
    };
    const res = await send(certStatus(host));
    expect(res.ok).toBe(false);
    expect(reads).toEqual([]);
  });
});

describe("site.write with redirects", () => {
  const write = (params: Record<string, unknown>) => ({
    id: "s1",
    op: "site.write",
    params: {
      target: { project: "kd_hello", env: "production" },
      hosts: ["example.com"],
      port: 20417,
      ...params,
    },
  });

  test("renders the 308 block next to the site", async () => {
    const { send, files } = setup();
    const res = await send(
      write({ redirects: [{ from: "www.example.com", to: "example.com" }] }),
    );
    expect(res).toMatchObject({ ok: true });
    expect(files.get("/etc/caddy/sites/kd_hello.caddy")).toContain(
      "www.example.com {\n\tredir https://example.com{uri} 308\n}\n",
    );
  });

  test.each([
    [{ redirects: [{ from: "www.example.com", to: "other.com" }] }],
    [{ redirects: [{ from: "deploy.fockus.dev", to: "example.com" }] }],
    [{ redirects: [{ from: "x.preview.fockus.dev", to: "example.com" }] }],
    [{ redirects: [{ from: "www.example.com", to: "example.com", x: 1 }] }],
    [
      {
        redirects: Array.from({ length: 51 }, (_, i) => ({
          from: `w${i}.example.com`,
          to: "example.com",
        })),
      },
    ],
  ])("refuses %j", async (params) => {
    const { send, files } = setup();
    const res = await send(write(params));
    expect(res.ok).toBe(false);
    expect(files.has("/etc/caddy/sites/kd_hello.caddy")).toBe(false);
  });
});
