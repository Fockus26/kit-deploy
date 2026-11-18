/**
 * What the panel's readers work with (lib/panel/runtime.ts builds the real ones), and the typed
 * "kit-agent did not answer" every reader returns in place of a throw: the page renders it as the
 * HANDOFF §5b service error in that section only, and the rest stays usable.
 */

import type { ErrorCode } from "@/agent/protocol";
import { type AgentClient, AgentUnreachable } from "@/cli/client";
import type { EnvStore } from "@/lib/db/env-store";
import type { TokenStore } from "@/lib/db/tokens";
import type { DomainStore } from "@/lib/domains/store";
import type { MetricsReader } from "@/lib/metrics/read";
import { AgentRefused } from "@/lib/ops/agent";
import type { PanelStore } from "./store";

export type PanelDeps = {
  /** A short timeout (reads only): a page never waits minutes for the agent. */
  agent: AgentClient;
  store: PanelStore;
  env: EnvStore;
  domains: DomainStore;
  metrics: MetricsReader;
  tokens: TokenStore;
  now(): number;
};

/** `code`: kit-agent answered and refused (else it did not answer at all). */
export type Unavailable = { unavailable: "agent"; code?: ErrorCode };

export function isUnavailable(x: unknown): x is Unavailable {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { unavailable?: unknown }).unavailable === "agent"
  );
}

/** The agent's answer, or Unavailable when it is down or refused; anything else still throws. */
export async function viaAgent<T>(
  read: () => Promise<T>,
): Promise<T | Unavailable> {
  try {
    return await read();
  } catch (e) {
    if (e instanceof AgentUnreachable) return { unavailable: "agent" };
    if (e instanceof AgentRefused)
      return { unavailable: "agent", code: e.code };
    throw e;
  }
}
