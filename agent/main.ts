/**
 * kit-agent entry point: `bun build --compile agent/main.ts` (D010), run as root by systemd
 * (unit and install in `infra/install.sh`, a later unit).
 *
 *   KIT_AGENT_SOCKET  default /run/kit-deploy/agent.sock
 *   KIT_AGENT_GROUP   default kit-deploy — the group allowed to connect
 */
import { Agent } from "./ops";
import { serve } from "./server";
import { systemDeps } from "./system";

const socketPath = process.env.KIT_AGENT_SOCKET ?? "/run/kit-deploy/agent.sock";
const group = process.env.KIT_AGENT_GROUP ?? "kit-deploy";

async function groupId(name: string): Promise<number> {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(name))
    throw new Error(`invalid group name ${name}`);
  const r = await systemDeps.run(["getent", "group", name]);
  const gid = Number(r.stdout.split(":")[2]);
  if (r.code !== 0 || !Number.isInteger(gid))
    throw new Error(`group ${name} not found`);
  return gid;
}

if (process.getuid?.() !== 0) {
  console.error("kit-agent must run as root");
  process.exit(1);
}

// The socket is created 0700 and only then opened to the group: never a moment world-writable.
process.umask(0o077);

const server = await serve(new Agent(systemDeps), systemDeps, {
  path: socketPath,
  gid: await groupId(group),
});
systemDeps.log({ event: "listening", socket: socketPath, group });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
