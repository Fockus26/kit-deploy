/**
 * What the CLI and the dashboard both do with kit-agent and the database (phase 05): the same
 * operation, the same rules, two front ends. These functions return data; each front end words
 * it (English for the CLI, Spanish for the panel).
 */

import type { ErrorCode, OpName } from "../../agent/protocol";
import type { AgentClient, Params } from "../../cli/client";

/** kit-agent answered, and refused. `message` is the agent's, which never echoes a value. */
export class AgentRefused extends Error {
  constructor(
    readonly op: OpName,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentRefused";
  }
}

/** A shared operation that cannot go ahead; `message` is the CLI's English line. */
export class OpsError extends Error {
  constructor(
    readonly code: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "OpsError";
  }
}

/** The op's result, or AgentRefused (AgentUnreachable passes through). */
export async function callAgent<O extends OpName>(
  agent: AgentClient,
  op: O,
  params: Params<O>,
): Promise<unknown> {
  const res = await agent.call(op, params);
  if (!res.ok) throw new AgentRefused(op, res.error.code, res.error.message);
  return res.result;
}
