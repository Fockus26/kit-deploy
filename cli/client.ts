/**
 * The agent's client: one request per connection over the unix socket (`agent/protocol.ts`).
 * The CLI and, later, the web app's API both talk to kit-agent only through this.
 */
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import type { OpName, Request, Response } from "../agent/protocol";

export type Params<O extends OpName> = Extract<Request, { op: O }>["params"];

export interface AgentClient {
  call<O extends OpName>(op: O, params: Params<O>): Promise<Response>;
}

export class AgentUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentUnreachable";
  }
}

/** Above the agent's slowest operation (a pull: 10 min). */
const DEFAULT_TIMEOUT_MS = 11 * 60_000;

export function socketClient(
  path: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): AgentClient {
  return {
    call(op, params) {
      const id = randomBytes(6).toString("hex");
      const line = `${JSON.stringify({ id, op, params })}\n`;
      return new Promise<Response>((resolve, reject) => {
        let out = "";
        const conn = connect(path, () => conn.write(line));
        conn.setEncoding("utf8");
        conn.setTimeout(timeoutMs, () => {
          conn.destroy();
          reject(
            new AgentUnreachable(`kit-agent did not answer ${op} in time`),
          );
        });
        conn.on("data", (d: string) => {
          out += d;
        });
        conn.on("end", () => {
          try {
            resolve(JSON.parse(out) as Response);
          } catch {
            reject(new AgentUnreachable("kit-agent sent an invalid response"));
          }
        });
        conn.on("error", (e: NodeJS.ErrnoException) => {
          const hint =
            e.code === "EACCES"
              ? " (is this user in the kit-deploy group?)"
              : e.code === "ENOENT" || e.code === "ECONNREFUSED"
                ? " (is kit-agent running?)"
                : "";
          reject(
            new AgentUnreachable(
              `cannot reach kit-agent at ${path}: ${e.code ?? e.message}${hint}`,
            ),
          );
        });
      });
    },
  };
}
