/**
 * A host's A and AAAA records through the system resolver, each lookup bounded: a slow or dead
 * name server never holds `domain check` past `timeoutMs` per host.
 */
import { Resolver } from "node:dns/promises";
import type { ResolveHost } from "./check";

/** "No such record" answers: an empty list, not a failure. */
const NO_RECORD = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN", "ENONAME"]);

export function systemResolver(timeoutMs = 5000): ResolveHost {
  return async (host) => {
    const r = new Resolver({ timeout: timeoutMs, tries: 1 });
    const lookup = (p: Promise<string[]>) =>
      p.catch((e: NodeJS.ErrnoException) => {
        if (e.code && NO_RECORD.has(e.code)) return [] as string[];
        throw e;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        r.cancel();
        reject(new Error(`no answer in ${timeoutMs / 1000}s`));
      }, timeoutMs + 500);
    });
    try {
      const [a, aaaa] = await Promise.race([
        Promise.all([lookup(r.resolve4(host)), lookup(r.resolve6(host))]),
        timeout,
      ]);
      return { a, aaaa };
    } finally {
      clearTimeout(timer);
    }
  };
}
