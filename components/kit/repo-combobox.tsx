"use client";

import { CheckIcon, ChevronDown, Lock } from "lucide-react";
import { useId, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { filterRepos, freeTextRepo, type Repo } from "@/lib/github/repo-filter";
import { cn } from "@/lib/utils";

/**
 * Nuevo proyecto's "Repositorio" (D062): a searchable list of César's GitHub repos, on Popover +
 * Command. The trigger has the Select trigger's box and takes the Field's `id` / `aria-*`, so
 * its label names it; the value travels in a hidden input under `name`. A valid `owner/repo`
 * that is not in the list can still be used ("Usar «…»"); the server validates it as before.
 *
 * Keyboard: Enter / Space / ↓ open it, typing filters, ↑↓ move, Enter picks, Esc closes (focus
 * goes back to the trigger).
 */
export function RepoCombobox({
  repos,
  truncated,
  id,
  name,
  value,
  onPick,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  repos: readonly Repo[];
  /** The list was cut at its cap: said under it. */
  truncated?: boolean;
  id?: string;
  name: string;
  value: string;
  /** `repo` is set when the value comes from the list (its default branch is known). */
  onPick: (fullName: string, repo: Repo | null) => void;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const shown = filterRepos(repos, query);
  const free = freeTextRepo(repos, query);

  const pick = (fullName: string, repo: Repo | null) => {
    onPick(fullName, repo);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && !open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            className={cn(
              "flex min-h-control w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card py-2 pr-3 pl-3 text-left text-input-touch text-foreground outline-none transition-colors duration-120 ease-default md:text-body",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "aria-invalid:border-destructive",
            )}
          >
            {/* PLACEHOLDER (CONTENT_CHECKLIST row 44): the picker's texts are provisional. */}
            <span
              className={cn(
                "min-w-0 truncate",
                value ? "font-mono" : "text-muted-foreground",
              )}
            >
              {value || "Elige un repositorio"}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command shouldFilter={false} label="Repositorios de GitHub">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Busca owner/repo"
              aria-label="Buscar repositorio"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
            />
            <CommandList id={listId} className="p-1">
              <CommandEmpty>
                Ningún repositorio coincide. Escribe owner/repo completo para
                usarlo.
              </CommandEmpty>
              {free ? (
                <CommandGroup>
                  <CommandItem
                    value={`free:${free}`}
                    onSelect={() => pick(free, null)}
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      Usar «<span className="font-mono">{free}</span>»
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {shown.length > 0 ? (
                <CommandGroup>
                  {shown.map((r) => (
                    <CommandItem
                      key={r.fullName}
                      value={r.fullName}
                      onSelect={() => pick(r.fullName, r)}
                    >
                      <CheckIcon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          r.fullName === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 font-mono [overflow-wrap:anywhere]">
                        {r.fullName}
                      </span>
                      {r.private ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 text-caption text-muted-foreground">
                          <Lock aria-hidden="true" className="size-3" />
                          Privado
                        </span>
                      ) : null}
                      {r.fullName === value ? (
                        <span className="sr-only">(elegido)</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
            {truncated ? (
              <p className="border-border border-t px-3 py-2 text-caption text-muted-foreground">
                Se muestran tus 500 repos con push más reciente.
              </p>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={value} />
    </>
  );
}
