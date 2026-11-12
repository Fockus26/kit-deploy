// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the tests match the templates' literal `${…}` (shell and Actions syntax)
/**
 * The templates' contract with the rest of kit-deploy (user, port, deploymentId, image name,
 * token handling). A real build of a sample app with the Dockerfile is in the PR that added them.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_USER, CONTAINER_PORT } from "../../lib/core/constants";

const read = (p: string) => readFileSync(p, "utf8");

type Step = {
  uses?: string;
  name?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Workflow = {
  on: { push: { branches: string[] } };
  permissions: Record<string, string>;
  jobs: { deploy: { steps: Step[] } };
};

describe("templates/Dockerfile", () => {
  const df = read("templates/Dockerfile");

  test("runs as kit-agent's user, on its container port", () => {
    expect(df).toContain(`USER ${APP_USER}`);
    expect(df).toContain(`EXPOSE ${CONTAINER_PORT}`);
    expect(df).toContain(`PORT=${CONTAINER_PORT}`);
    expect(df).toContain("HOSTNAME=0.0.0.0");
  });

  test("the last USER is not root", () => {
    const users = [...df.matchAll(/^USER (.+)$/gm)].map((m) => m[1]);
    expect(users.at(-1)).toBe(APP_USER);
  });

  test("deploymentId is the commit, and the build refuses to run without it", () => {
    expect(df).toContain("NEXT_DEPLOYMENT_ID=${GIT_SHA}");
    expect(df).toMatch(/if \[ -z "\$GIT_SHA" \]/);
  });

  test("standalone output is required and served by node server.js", () => {
    expect(df).toContain(".next/standalone/server.js");
    expect(df).toContain('CMD ["node", "server.js"]');
  });

  test("base images are pinned", () => {
    expect(df).toMatch(/^ARG BUN_VERSION=\d+\.\d+\.\d+$/m);
    expect(df).toMatch(/^ARG NODE_VERSION=\d+-alpine$/m);
  });
});

describe("templates/dockerignore", () => {
  test("keeps secrets and local state out of the image", () => {
    const lines = read("templates/dockerignore").split("\n");
    for (const p of [".env*", ".git", "node_modules", ".next", "context"]) {
      expect(lines).toContain(p);
    }
  });
});

describe("templates/deploy-vps.yml", () => {
  const wf = Bun.YAML.parse(read("templates/deploy-vps.yml")) as Workflow;
  const steps = wf.jobs.deploy.steps;

  test("least privilege: read the code, write packages, nothing else", () => {
    expect(wf.permissions).toEqual({ contents: "read", packages: "write" });
  });

  test("pushes a lowercase ghcr.io/<repo>:<sha> image, built with GIT_SHA", () => {
    const image = steps.find((s) => s.name === "Image name");
    expect(image?.run).toContain(
      "ghcr.io/${GITHUB_REPOSITORY,,}:${GITHUB_SHA}",
    );
    const build = steps.find((s) =>
      s.uses?.startsWith("docker/build-push-action"),
    );
    expect(build?.with?.push).toBe(true);
    expect(build?.with?.["build-args"]).toBe("GIT_SHA=${{ github.sha }}");
  });

  test("posts only the sha, with the token from secrets and never in argv", () => {
    const deploy = steps.find((s) => s.name === "Deploy");
    expect(deploy?.env?.KIT_DEPLOY_TOKEN).toBe(
      "${{ secrets.KIT_DEPLOY_TOKEN }}",
    );
    expect(deploy?.run).toContain("--header @-");
    expect(deploy?.run).toContain('--data "{\\"sha\\":\\"${GITHUB_SHA}\\"}"');
    expect(deploy?.run).toContain("/api/v1/deploy");
    // The token is only ever piped through printf, never put on curl's command line.
    expect(deploy?.run).not.toMatch(/curl[^|]*KIT_DEPLOY_TOKEN/);
  });

  test("every action is pinned to a major version", () => {
    for (const s of steps.filter((s) => s.uses)) {
      expect(s.uses).toMatch(/@v\d+$/);
    }
  });
});
