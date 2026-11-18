import { CopyValue } from "./copy-value";

/** A command to copy and run elsewhere (a terminal, GitHub): mono on `--raised`, wraps anywhere. */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 rounded-sm bg-raised px-3 py-2 font-mono text-mono [overflow-wrap:anywhere]">
        {command}
      </code>
      <CopyValue value={command} />
    </div>
  );
}
