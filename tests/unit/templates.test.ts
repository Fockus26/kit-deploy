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
  id?: string;
  uses?: string;
  name?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = {
  if?: string;
  permissions: Record<string, string>;
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: {
    push: { branches: string[] };
    pull_request: { types: string[] };
    [event: string]: unknown;
  };
  concurrency: { group: string; "cancel-in-progress": boolean };
  permissions: Record<string, string>;
  jobs: { deploy: Job; "close-preview": Job; "no-preview": Job };
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
  const raw = read("templates/deploy-vps.yml");
  const wf = Bun.YAML.parse(raw) as Workflow;
  const { deploy, "close-preview": close, "no-preview": skip } = wf.jobs;
  const steps = deploy.steps;
  const fromThisRepo =
    "github.event.pull_request.head.repo.full_name == github.repository";

  test("production: push to main and manual runs, as before", () => {
    expect(wf.on.push.branches).toEqual(["main"]);
    expect("workflow_dispatch" in wf.on).toBe(true);
  });

  test("previews: pull_request (never pull_request_target) with its four actions", () => {
    expect(wf.on.pull_request.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "closed",
    ]);
    expect(raw).not.toContain("pull_request_target:");
    expect("pull_request_target" in wf.on).toBe(false);
  });

  test("one run per PR (or branch): a newer push cancels the build in course", () => {
    expect(wf.concurrency["cancel-in-progress"]).toBe(true);
    expect(wf.concurrency.group).toContain(
      "format('pr-{0}', github.event.pull_request.number)",
    );
    expect(wf.concurrency.group).toContain("github.ref");
  });

  test("least privilege: nothing by default, packages only where the image is pushed", () => {
    expect(wf.permissions).toEqual({});
    expect(deploy.permissions).toEqual({ contents: "read", packages: "write" });
    expect(close.permissions).toEqual({});
    expect(skip.permissions).toEqual({});
  });

  test("forks and Dependabot get no secret: their PRs are skipped with a notice", () => {
    for (const job of [deploy, close]) {
      expect(job.if).toContain(fromThisRepo);
      expect(job.if).toContain("github.actor != 'dependabot[bot]'");
    }
    expect(skip.if).toContain(
      "github.event.pull_request.head.repo.full_name != github.repository",
    );
    expect(skip.if).toContain("github.actor == 'dependabot[bot]'");
    expect(skip.steps[0]?.run).toContain("::notice");
    expect(skip.steps[0]?.run).not.toContain("exit 1");
    expect(JSON.stringify(skip)).not.toContain("secrets.");
  });

  test("deploy runs for pushes and open PRs; close-preview only when the PR closes", () => {
    expect(deploy.if).toContain("github.event_name != 'pull_request'");
    expect(deploy.if).toContain("github.event.action != 'closed'");
    expect(close.if).toContain("github.event.action == 'closed'");
  });

  test("builds and names the PR's head commit, not GitHub's merge commit", () => {
    expect(deploy.env?.SHA).toBe(
      "${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(deploy.env?.PR).toBe("${{ github.event.pull_request.number }}");
    const checkout = steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkout?.with?.ref).toBe("${{ env.SHA }}");
  });

  test("pushes a lowercase ghcr.io/<repo>:<sha> image, built with GIT_SHA", () => {
    const image = steps.find((s) => s.name === "Image name");
    expect(image?.run).toContain("ghcr.io/${GITHUB_REPOSITORY,,}:${SHA}");
    const build = steps.find((s) =>
      s.uses?.startsWith("docker/build-push-action"),
    );
    expect(build?.with?.push).toBe(true);
    expect(build?.with?.["build-args"]).toBe(
      "GIT_SHA=${{ env.SHA }}\nBUILD_ENV_HASH=${{ steps.buildenv.outputs.hash }}\n",
    );
  });

  test("new build variables miss BuildKit's cache (it ignores a secret's content)", () => {
    const run = steps.find((s) => s.name === "Build variables")?.run ?? "";
    expect(steps.find((s) => s.name === "Build variables")?.id).toBe(
      "buildenv",
    );
    expect(run).toContain(
      'echo "hash=$(sha256sum "$RUNNER_TEMP/build.env" | cut -c1-64)" >> "$GITHUB_OUTPUT"',
    );
    const dockerfile = read("templates/Dockerfile");
    // Declared right before the build: a changed hash misses the cache there, not earlier.
    expect(dockerfile).toMatch(
      /ARG BUILD_ENV_HASH\nRUN --mount=type=secret,id=build_env/,
    );
  });

  test("build variables: its environment from build-env, as a BuildKit secret file", () => {
    const names = steps.map((s) => s.name ?? s.uses);
    expect(names.indexOf("Build variables")).toBeLessThan(
      names.indexOf("docker/build-push-action@v6"),
    );
    const run = steps.find((s) => s.name === "Build variables")?.run ?? "";
    expect(run).toContain("environment=production");
    expect(run).toContain('if [ -n "$PR" ]; then environment=preview; fi');
    expect(run).toContain('--data "{\\"environment\\":\\"${environment}\\"}"');
    expect(run).toContain("/api/v1/build-env");
    // The response goes to a file (never the log), and the key is masked before anything prints.
    expect(run).toContain('--output "$RUNNER_TEMP/build-env.json"');
    expect(run).toContain("umask 077");
    expect(run.indexOf("::add-mask::")).toBeLessThan(
      run.indexOf('echo "Build variables'),
    );
    expect(run).not.toMatch(/jq -r \.dotenv[^>]*$/m);
    const build = steps.find((s) => s.uses === "docker/build-push-action@v6");
    expect(build?.with?.["secret-files"]).toBe(
      "build_env=${{ runner.temp }}/build.env",
    );
    // Never a build-arg: those stay in the image's history.
    expect(build?.with?.["build-args"]).not.toContain("NEXT_");
  });

  test("the Dockerfile mounts the build variables for `bun run build` only", () => {
    const dockerfile = read("templates/Dockerfile");
    expect(dockerfile).toContain(
      "RUN --mount=type=secret,id=build_env,target=/app/.env.production.local,required=false \\\n    bun run build",
    );
    expect(dockerfile).not.toMatch(/ARG NEXT_|ENV NEXT_PUBLIC|COPY[^\n]*\.env/);
  });

  test("a manual run asked as a rebuild posts {sha, rebuild: true}, nothing else does", () => {
    const dispatch = wf.on.workflow_dispatch as {
      inputs: { rebuild: { type: string; default: boolean } };
    };
    expect(dispatch.inputs.rebuild).toMatchObject({
      type: "boolean",
      default: false,
    });
    const step = steps.find((s) => s.name === "Deploy");
    expect(step?.env?.REBUILD).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.rebuild && 'true' || '' }}",
    );
    const run = step?.run ?? "";
    expect(run).toContain('elif [ "$REBUILD" = "true" ]; then');
    expect(run).toContain('body="{\\"sha\\":\\"${SHA}\\",\\"rebuild\\":true}"');
    // A PR never sends it: its branch comes first.
    expect(run.indexOf('if [ -n "$PR" ]')).toBeLessThan(run.indexOf("REBUILD"));
  });

  test("posts {sha} for production and {sha, pr} for a preview", () => {
    const run = steps.find((s) => s.name === "Deploy")?.run ?? "";
    expect(run).toContain('body="{\\"sha\\":\\"${SHA}\\",\\"pr\\":${PR}}"');
    expect(run).toContain('body="{\\"sha\\":\\"${SHA}\\"}"');
    expect(run).toContain('--data "$body"');
    expect(run).toContain("/api/v1/deploy");
  });

  test("a closed PR deletes its preview with {pr}", () => {
    const run = close.steps.find((s) => s.name === "Remove preview")?.run ?? "";
    expect(run).toContain("--request DELETE");
    expect(run).toContain('--data "{\\"pr\\":${PR}}"');
    expect(run).toContain("/api/v1/preview");
  });

  test("the token comes from secrets, only through stdin, never echoed or in a URL", () => {
    const tokenSteps = [
      steps.find((s) => s.name === "Build variables"),
      steps.find((s) => s.name === "Deploy"),
      close.steps.find((s) => s.name === "Remove preview"),
    ];
    for (const s of tokenSteps) {
      expect(s?.env?.KIT_DEPLOY_TOKEN).toBe("${{ secrets.KIT_DEPLOY_TOKEN }}");
      const run = s?.run ?? "";
      expect(run).toContain("--header @-");
      expect(run).toContain(
        "printf 'Authorization: Bearer %s\\n' \"$KIT_DEPLOY_TOKEN\" |",
      );
      // Never on curl's command line, in an echo, or in the URL.
      expect(run).not.toMatch(/curl[^|]*KIT_DEPLOY_TOKEN/);
      expect(run).not.toMatch(/echo[^\n]*\$\{?KIT_DEPLOY_TOKEN/);
      expect(run).not.toMatch(/https?:\/\/[^\s"]*KIT_DEPLOY_TOKEN/);
    }
    // The secret is only read where it is used, never in a run line directly.
    expect(raw.match(/secrets\.KIT_DEPLOY_TOKEN/g)).toHaveLength(3);
    expect(raw).not.toMatch(/run:[^\n]*secrets\./);
  });

  test("every action is pinned to a major version", () => {
    for (const job of Object.values(wf.jobs)) {
      for (const s of job.steps.filter((s) => s.uses)) {
        expect(s.uses).toMatch(/@v\d+$/);
      }
    }
  });
});
