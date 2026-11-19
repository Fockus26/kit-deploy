"use client";

import { useState } from "react";
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
  return (
    <Select
      name={name}
      value={current}
      onValueChange={(v) => {
        setOwn(v);
        onValueChange?.(v);
      }}
    >
      <SelectTrigger
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
  );
}
