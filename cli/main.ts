/**
 * `kit-deploy` entry point: `bun build --compile cli/main.ts` (D010), installed on the VPS by
 * `infra/install.sh` and used over SSH (`ssh kit-vps kit-deploy list`).
 *
 *   KIT_AGENT_SOCKET  default /run/kit-deploy/agent.sock
 *   DATABASE_URL      else read from /etc/kit-deploy/cli.env (deploy, rollback, regenerate)
 *   GITHUB_STATUS_TOKEN  else read from /etc/kit-deploy/github.env if readable (root): `deploy`
 *                     publishes the commit status with it; `preview sweep` reads PR state and
 *                     edits the PR comment with it
 */
import { drizzleAdminStore } from "../lib/db/admin";
import { drizzleEnvStore, sshActor } from "../lib/db/env-store";
import { db, drizzleStore } from "../lib/db/store";
import { drizzleUserStore } from "../lib/db/users";
import { statusPublisherFromEnv } from "../lib/deploy/commit-status";
import {
  drizzleSweepRepo,
  drizzleSwitchRepo,
} from "../lib/deploy/drizzle-repo";
import { commenterFromEnv } from "../lib/deploy/pr-comment";
import { pullStateFromEnv } from "../lib/deploy/pr-state";
import { socketClient } from "./client";
import { runCli } from "./commands";
import { loadCliEnv, loadGithubEnv } from "./env";
import { writePinFile } from "./pins";
import { readValue } from "./stdin";

const socket = process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock";
const agent = socketClient(socket);
const { code, out, err } = await runCli(process.argv.slice(2), agent, {
  stdoutIsTTY: process.stdout.isTTY === true,
  actor: sshActor(),
  pins: { isRoot: process.getuid?.() === 0, write: writePinFile },
  readValue,
  env: () => {
    loadCliEnv();
    return drizzleEnvStore(db());
  },
  admin: () => {
    loadCliEnv();
    return drizzleAdminStore(db());
  },
  users: () => {
    loadCliEnv();
    return drizzleUserStore(db());
  },
  deploy: () => {
    loadCliEnv();
    loadGithubEnv();
    const database = db();
    return {
      store: drizzleStore(database),
      switch: {
        agent,
        repo: drizzleSwitchRepo(database),
        status: statusPublisherFromEnv(),
        // Progress on stderr: stdout stays the result agents parse.
        log: (e) => process.stderr.write(`${JSON.stringify(e)}\n`),
      },
    };
  },
  sweep: () => {
    loadCliEnv();
    loadGithubEnv();
    const database = db();
    return {
      sweep: drizzleSweepRepo(database),
      pullState: pullStateFromEnv(),
      switch: {
        agent,
        repo: drizzleSwitchRepo(database),
        comments: commenterFromEnv(),
        // Progress on stderr (the journal): stdout is one line per action and the summary.
        log: (e) => process.stderr.write(`${JSON.stringify(e)}\n`),
      },
    };
  },
});
if (out) process.stdout.write(out);
if (err) process.stderr.write(err);
process.exit(code);
