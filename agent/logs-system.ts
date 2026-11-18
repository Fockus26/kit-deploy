/**
 * The real side effects behind `LogDeps` (`logs.ts` holds the logic, tested with fakes).
 *
 * Containers are followed through the Docker Engine API on its unix socket, not with one
 * `docker logs -f` process each (D024): a CLI per container would sit in kit-agent's cgroup
 * (MemoryMax 256M) and grow with every preview.
 */
import { createReadStream, createWriteStream } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  open,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import type { LogDeps, Stream } from "./logs";

export const DOCKER_SOCKET = "/var/run/docker.sock";
/** Until Docker answers the request's headers; the stream itself then lasts as the container. */
const CONNECT_TIMEOUT_MS = 10_000;
/** A frame bigger than this is not a log line: the stream is wrong, stop reading it. */
const MAX_FRAME_BYTES = 1024 * 1024;
/** A line with no newline yet is passed on once it reaches this (it is cut later anyway). */
const MAX_PENDING_CHARS = 64 * 1024;

/** Docker's multiplexed stream (no TTY): 8-byte header [stream, 0, 0, 0, size BE32], payload. */
export function frameDecoder(onLine: (stream: Stream, raw: string) => void) {
  let buf = Buffer.alloc(0);
  const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
  const partial = { stdout: "", stderr: "" };
  const emit = (stream: Stream, text: string) => {
    const pieces = (partial[stream] + text).split("\n");
    partial[stream] = pieces.pop() ?? "";
    for (const p of pieces) onLine(stream, p);
    if (partial[stream].length >= MAX_PENDING_CHARS) {
      onLine(stream, partial[stream]);
      partial[stream] = "";
    }
  };
  return {
    push(chunk: Uint8Array): void {
      buf = buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const type = buf[0];
        const size = buf.readUInt32BE(4);
        if (size > MAX_FRAME_BYTES || (type !== 1 && type !== 2 && type !== 0))
          throw new Error("unexpected data in the Docker log stream");
        if (buf.length < 8 + size) break;
        const stream: Stream = type === 2 ? "stderr" : "stdout";
        emit(
          stream,
          decoders[stream].decode(buf.subarray(8, 8 + size), { stream: true }),
        );
        buf = buf.subarray(8 + size);
      }
    },
    end(): void {
      for (const s of ["stdout", "stderr"] as const) {
        if (partial[s] !== "") onLine(s, partial[s]);
        partial[s] = "";
      }
    },
  };
}

async function follow(
  container: string,
  since: string,
  onLine: (stream: Stream, raw: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const query = new URLSearchParams({
    follow: "1",
    stdout: "1",
    stderr: "1",
    timestamps: "1",
    since,
  });
  const url = `http://docker/containers/${encodeURIComponent(container)}/logs?${query}`;
  const connect = AbortSignal.timeout(CONNECT_TIMEOUT_MS);
  const res = await fetch(url, {
    unix: DOCKER_SOCKET,
    signal: AbortSignal.any([signal, connect]),
  } as RequestInit);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new Error(`docker logs ${container}: HTTP ${res.status}`);
  }
  // Headers are in: from here only the caller's signal stops the stream.
  const reader = res.body.getReader();
  const stopReading = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", stopReading, { once: true });
  const decoder = frameDecoder(onLine);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      decoder.push(value);
    }
    decoder.end();
  } finally {
    signal.removeEventListener("abort", stopReading);
  }
}

async function privateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
}

async function append(path: string, text: string): Promise<void> {
  await privateDir(dirname(path));
  await appendFile(path, text, { mode: 0o600 });
}

async function size(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
}

async function* lines(path: string): AsyncIterable<string> {
  let input: NodeJS.ReadableStream;
  try {
    // Opened first so a missing file is "no lines", not a stream error.
    const fh = await open(path, "r");
    const raw = fh.createReadStream();
    input = path.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  const rl = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of rl) yield line;
  } finally {
    rl.close();
  }
}

async function readTail(
  path: string,
  maxBytes: number,
): Promise<{ text: string; whole: boolean } | null> {
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(path, "r");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    const total = (await fh.stat()).size;
    const start = Math.max(0, total - maxBytes);
    const buf = Buffer.alloc(total - start);
    await fh.read(buf, 0, buf.length, start);
    return { text: buf.toString("utf8"), whole: start === 0 };
  } finally {
    await fh.close();
  }
}

async function list(dir: string, kind: "file" | "dir"): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (kind === "file" ? e.isFile() : e.isDirectory()))
      .map((e) => e.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function gzip(path: string): Promise<void> {
  // Appended as one more gzip member if a part of the day is already there: gunzip reads both.
  await pipeline(
    createReadStream(path),
    createGzip(),
    createWriteStream(`${path}.gz`, { flags: "a", mode: 0o600 }),
  );
  await rm(path, { force: true });
}

async function remove(path: string): Promise<void> {
  await rm(path, { force: true });
}

export const systemLogDeps: LogDeps = {
  follow,
  append,
  size,
  lines,
  readTail,
  list,
  gzip,
  remove,
};
