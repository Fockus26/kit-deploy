/**
 * Everything kit-agent does to the machine goes through `Deps`, so the operations are tested
 * with fakes and the real side effects live in one small file (`system.ts`).
 */

export type RunResult = { code: number; stdout: string; stderr: string };

export interface Deps {
  /** Runs argv directly (no shell). Never pass a joined string. `env` is added to the agent's
   * own environment for this one command (a secret meant only for it). */
  run(
    argv: readonly string[],
    opts?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<RunResult>;
  /** null when the file does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Write to `<path>.tmp` and rename over `path`: readers never see half a file. */
  writeFileAtomic(path: string, content: string): Promise<void>;
  /** No error when it is already gone. */
  removeFile(path: string): Promise<void>;
  /** Names of the regular files directly in `dir` (no symlinks, no subdirectories); [] when the
   * directory does not exist. */
  listFiles(dir: string): Promise<string[]>;
  httpGet(url: string, timeoutMs: number): Promise<{ status: number }>;
  /** One structured line per operation. Never params' values that could hold a secret. */
  log(event: Record<string, unknown>): void;
}
