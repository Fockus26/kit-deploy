/**
 * `kit-deploy` entry point: `bun build --compile cli/main.ts` (D010), installed on the VPS by
 * `infra/install.sh` and used over SSH (`ssh kit-vps kit-deploy list`).
 *
 *   KIT_AGENT_SOCKET  default /run/kit-deploy/agent.sock
 */
import { socketClient } from "./client";
import { runCli } from "./commands";

const socket = process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock";
const { code, out, err } = await runCli(
  process.argv.slice(2),
  socketClient(socket),
);
if (out) process.stdout.write(out);
if (err) process.stderr.write(err);
process.exit(code);
