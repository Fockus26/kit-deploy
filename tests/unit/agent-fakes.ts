import type { Deps, RunResult } from "../../agent/deps";

type Handler = (argv: readonly string[]) => Partial<RunResult> | undefined;

/** In-memory `Deps`: records every command, keeps files in a Map, answers commands by prefix. */
export function fakeDeps(handlers: Record<string, Handler> = {}) {
  const calls: string[][] = [];
  const runOpts: Array<
    { timeoutMs?: number; env?: Record<string, string> } | undefined
  > = [];
  const files = new Map<string, string>();
  /** readFileFrom's inode per path (default 1): a new one is a rolled log. */
  const inodes = new Map<string, number>();
  /** path → target: readFile follows it, readFileFrom refuses it (O_NOFOLLOW, ELOOP). */
  const symlinks = new Map<string, string>();
  const logs: Record<string, unknown>[] = [];
  const privateFiles: { path: string; content: string }[] = [];
  let httpStatus: number | Error = 200;
  const httpCalls: {
    url: string;
    timeoutMs: number;
    headers?: Record<string, string>;
  }[] = [];

  const deps: Deps = {
    async run(argv, opts) {
      calls.push([...argv]);
      runOpts.push(opts);
      const key = Object.keys(handlers)
        .sort((a, b) => b.length - a.length)
        .find((k) => argv.join(" ").startsWith(k));
      const r = key ? handlers[key]?.(argv) : undefined;
      return { code: 0, stdout: "", stderr: "", ...r };
    },
    async readFile(path) {
      return files.get(symlinks.get(path) ?? path) ?? null;
    },
    async writeFileAtomic(path, content) {
      files.set(path, content);
    },
    async writePrivateFile(path, content) {
      files.set(path, content);
      privateFiles.push({ path, content });
    },
    async removeFile(path) {
      files.delete(path);
    },
    async listFiles(dir) {
      const prefix = `${dir}/`;
      return [...files.keys()]
        .filter(
          (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"),
        )
        .map((k) => k.slice(prefix.length));
    },
    async httpGet(url, timeoutMs, headers) {
      httpCalls.push({ url, timeoutMs, headers });
      if (httpStatus instanceof Error) throw httpStatus;
      return { status: httpStatus };
    },
    log(e) {
      logs.push(e);
    },
    async readFileFrom(path, offset, maxBytes) {
      if (symlinks.has(path))
        throw Object.assign(new Error(`ELOOP: ${path}`), { code: "ELOOP" });
      const text = files.get(path);
      if (text === undefined) return null;
      const all = Buffer.from(text, "utf8");
      return {
        ino: inodes.get(path) ?? 1,
        size: all.length,
        data: all.subarray(offset, offset + maxBytes),
      };
    },
  };

  return {
    deps,
    calls,
    runOpts,
    files,
    inodes,
    symlinks,
    privateFiles,
    logs,
    httpCalls,
    setHttp(s: number | Error) {
      httpStatus = s;
    },
  };
}
