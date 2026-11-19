"use client";

import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = { value: string; label: string };

/**
 * A closed list of options on the Select primitive. The `id` / `aria-*` props go on the trigger,
 * so a `<label for>` (the Field's) names it. Values cannot be "" (use a sentinel).
 *
 * In a form it keeps what it shows across the form's `reset` (D064): React resets a
 * `<form action={…}>` when the action settles, and Radix Select answers that reset by setting
 * its first value, which used to overwrite the parent's state after a refused submit. The value
 * travels in our own hidden input under `name` (not Radix's native select, which the browser's
 * reset rewinds). A form that wants to clear after a success does it through its own state/key.
 */
export function OptionSelect({
  options,
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  options: readonly SelectOption[];
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  // Radix only renders the items once open, so the trigger would be empty in the server's HTML
  // (and until hydration): the shown label is resolved here from the current value.
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const label = options.find((o) => o.value === current)?.label;

  // True while the trigger's form dispatches `reset`. The capture listener on the document runs
  // before Radix's own listener on the form, and the reset is dispatched synchronously.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resetting = useRef(false);
  useEffect(() => {
    const doc = triggerRef.current?.ownerDocument;
    if (!doc) return;
    const mark = (e: Event) => {
      if (e.target !== triggerRef.current?.form) return;
      resetting.current = true;
      queueMicrotask(() => {
        resetting.current = false;
      });
    };
    doc.addEventListener("reset", mark, true);
    return () => doc.removeEventListener("reset", mark, true);
  }, []);

  return (
    <>
      <Select
        value={current}
        onValueChange={(v) => {
          if (resetting.current) return;
          setOwn(v);
          onValueChange?.(v);
        }}
      >
        <SelectTrigger
          ref={triggerRef}
          id={id}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={className}
        >
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className={className}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name !== undefined && current !== undefined ? (
        <input type="hidden" name={name} value={current} />
      ) : null}
    </>
  );
}
