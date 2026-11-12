/**
 * `kit-deploy` entry point: `bun build --compile cli/main.ts` (D010), installed on the VPS by
 * `infra/install.sh` and used over SSH (`ssh kit-vps kit-deploy list`).
 *
 *   KIT_AGENT_SOCKET  default /run/kit-deploy/agent.sock
 *   DATABASE_URL      else read from /etc/kit-deploy/cli.env (deploy, rollback, regenerate)
 */
import { db, drizzleStore } from "../lib/db/store";
import { drizzleSwitchRepo } from "../lib/deploy/drizzle-repo";
import { socketClient } from "./client";
import { runCli } from "./commands";
import { loadCliEnv } from "./env";

const socket = process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock";
const agent = socketClient(socket);
const { code, out, err } = await runCli(process.argv.slice(2), agent, {
  deploy: () => {
    loadCliEnv();
    const database = db();
    return {
      store: drizzleStore(database),
      switch: {
        agent,
        repo: drizzleSwitchRepo(database),
        // Progress on stderr: stdout stays the result agents parse.
        log: (e) => process.stderr.write(`${JSON.stringify(e)}\n`),
      },
    };
  },
});
if (out) process.stdout.write(out);
if (err) process.stderr.write(err);
process.exit(code);
