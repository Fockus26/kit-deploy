import { CoreInputError } from "../lib/core/validate";
import type { Deps } from "./deps";
import { type Agent, AgentError } from "./ops";
import { Request, type Response } from "./protocol";

function fail(
  id: string | null,
  code: Extract<Response, { ok: false }>["error"]["code"],
  message: string,
): Response {
  return { id, ok: false, error: { code, message } };
}

/** The id of a request that did not validate, if it had a usable one, so the client can match. */
function looseId(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return id;
  }
  return null;
}

/** One request line in, one response out. Never throws. */
export async function dispatch(
  agent: Agent,
  deps: Deps,
  line: string,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return fail(null, "bad_request", "request is not valid JSON");
  }
  const parsed = Request.safeParse(raw);
  if (!parsed.success) {
    const id = looseId(raw);
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    deps.log({ id, op: null, ok: false, code: "bad_request" });
    return fail(id, "bad_request", issues);
  }

  const req = parsed.data;
  const started = Date.now();
  try {
    const result = await agent.execute(req);
    deps.log({ id: req.id, op: req.op, ok: true, ms: Date.now() - started });
    return { id: req.id, ok: true, result };
  } catch (e) {
    const ms = Date.now() - started;
    if (e instanceof AgentError || e instanceof CoreInputError) {
      const code = e instanceof AgentError ? e.code : "bad_request";
      deps.log({ id: req.id, op: req.op, ok: false, code, ms });
      return fail(req.id, code, e.message);
    }
    // An unexpected error stays in the agent's journal; the client only learns it happened.
    deps.log({
      id: req.id,
      op: req.op,
      ok: false,
      code: "internal",
      ms,
      detail: String(e),
    });
    return fail(req.id, "internal", "internal error");
  }
}
