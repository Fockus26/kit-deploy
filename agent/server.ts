/**
 * The unix socket. Who may talk to the agent is decided by the socket file's permissions
 * (root:<group> 0660): the web app's and the CLI's users are in that group, nobody else is.
 */
import { chmod, chown, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import type { Deps } from "./deps";
import { dispatch } from "./dispatch";
import type { Agent } from "./ops";
import { MAX_REQUEST_BYTES, type Response } from "./protocol";

/** A client that connects and sends nothing is dropped after this. */
const IDLE_MS = 30_000;

export type ServeOptions = {
  path: string;
  /** Group that may connect; null leaves the owner's (tests). */
  gid: number | null;
};

export async function serve(
  agent: Agent,
  deps: Deps,
  opts: ServeOptions,
): Promise<Server> {
  // A socket left by a crashed run would make listen fail with EADDRINUSE.
  await rm(opts.path, { force: true });

  const server = createServer((conn) => {
    let buf = "";
    let handled = false;
    conn.setEncoding("utf8");
    conn.setTimeout(IDLE_MS, () => conn.destroy());

    const reply = (res: Response) => {
      conn.end(`${JSON.stringify(res)}\n`);
    };

    conn.on("data", (chunk: string) => {
      if (handled) return;
      buf += chunk;
      if (Buffer.byteLength(buf) > MAX_REQUEST_BYTES) {
        handled = true;
        reply({
          id: null,
          ok: false,
          error: { code: "bad_request", message: "request too large" },
        });
        return;
      }
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      handled = true;
      // No idle timeout while an operation (a pull can take minutes) is running.
      conn.setTimeout(0);
      void dispatch(agent, deps, buf.slice(0, nl)).then(reply);
    });
    conn.on("error", () => conn.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (opts.gid !== null) await chown(opts.path, 0, opts.gid);
  await chmod(opts.path, 0o660);
  return server;
}
