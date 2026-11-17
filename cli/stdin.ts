/**
 * `env set`'s value: a terminal gets one line with echo off (`stty`, restored even on error); a
 * pipe is read whole. Never through argv, so never in `ps` or the shell's history.
 */
export async function readValue(): Promise<string> {
  if (!process.stdin.isTTY) return await Bun.stdin.text();
  process.stderr.write("Value (not shown): ");
  Bun.spawnSync(["stty", "-echo"], { stdin: "inherit" });
  try {
    for await (const line of console) return line;
    return "";
  } finally {
    Bun.spawnSync(["stty", "echo"], { stdin: "inherit" });
    process.stderr.write("\n");
  }
}
