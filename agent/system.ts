/** The real side effects behind `Deps`. Kept tiny: the logic is in `ops.ts`, tested with fakes. */
import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Deps, RunResult } from "./deps";

const DEFAULT_TIMEOUT_MS = 120_000;

async function run(
  argv: readonly string[],
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<RunResult> {
  let proc: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    proc = Bun.spawn([...argv], {
      stdin: "ignore",
      ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
      stdout: "pipe",
      stderr: "pipe",
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } catch (e) {
    // A missing binary (docker, caddy, ss) is a failed command with its reason, like a shell's 127.
    return {
      code: 127,
      stdout: "",
      stderr: `${argv[0]}: ${(e as Error).message}`,
    };
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

async function readFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  // `wx` (O_CREAT|O_EXCL): never follows a symlink left at the tmp path.
  await rm(tmp, { force: true });
  await writeFile(tmp, content, { flag: "wx" });
  // Explicit: the agent's umask (077) would leave it 0600, and Caddy runs as its own user.
  await chmod(tmp, 0o644);
  await rename(tmp, path);
}

async function writePrivateFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Also when it already existed with another mode.
  await chmod(dir, 0o700);
  const tmp = `${path}.tmp`;
  await rm(tmp, { force: true });
  await writeFile(tmp, content, { flag: "wx", mode: 0o600 });
  await rename(tmp, path);
}

async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function httpGet(
  url: string,
  timeoutMs: number,
): Promise<{ status: number }> {
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.body?.cancel();
  return { status: res.status };
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...event }));
}

export const systemDeps: Deps = {
  run,
  readFile,
  writeFileAtomic,
  writePrivateFile,
  removeFile,
  listFiles,
  httpGet,
  log,
};
