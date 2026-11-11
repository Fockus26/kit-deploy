import type { Deps, RunResult } from "../../agent/deps";

type Handler = (argv: readonly string[]) => Partial<RunResult> | undefined;

/** In-memory `Deps`: records every command, keeps files in a Map, answers commands by prefix. */
export function fakeDeps(handlers: Record<string, Handler> = {}) {
  const calls: string[][] = [];
  const files = new Map<string, string>();
  const logs: Record<string, unknown>[] = [];
  let httpStatus: number | Error = 200;

  const deps: Deps = {
    async run(argv) {
      calls.push([...argv]);
      const key = Object.keys(handlers)
        .sort((a, b) => b.length - a.length)
        .find((k) => argv.join(" ").startsWith(k));
      const r = key ? handlers[key]?.(argv) : undefined;
      return { code: 0, stdout: "", stderr: "", ...r };
    },
    async readFile(path) {
      return files.get(path) ?? null;
    },
    async writeFileAtomic(path, content) {
      files.set(path, content);
    },
    async removeFile(path) {
      files.delete(path);
    },
    async httpGet() {
      if (httpStatus instanceof Error) throw httpStatus;
      return { status: httpStatus };
    },
    log(e) {
      logs.push(e);
    },
  };

  return {
    deps,
    calls,
    files,
    logs,
    setHttp(s: number | Error) {
      httpStatus = s;
    },
  };
}
