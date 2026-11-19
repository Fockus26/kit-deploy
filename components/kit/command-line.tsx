import { CopyValue } from "./copy-value";

/** Longest token kept whole (flags, subcommands, slugs); a longer one (URL, id) may break anywhere. */
const WHOLE_TOKEN_MAX = 24;

/**
 * A command to copy and run elsewhere (a terminal, GitHub): mono on `--raised`. It wraps between
 * words and never inside a short one: `--to` or `kit-deploy` split at their hyphen read as two
 * different words, so each is a no-wrap span.
 */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 rounded-sm bg-raised px-3 py-2 font-mono text-mono [overflow-wrap:anywhere]">
        {command.split(/( +)/).map((part, i) =>
          part.trim() && part.length <= WHOLE_TOKEN_MAX ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string, never reordered
            <span key={i} className="whitespace-nowrap">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </code>
      <CopyValue value={command} />
    </div>
  );
}
