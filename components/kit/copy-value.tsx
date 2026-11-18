"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "error";

/** How long "Copiado" stays on the button (HANDOFF §2). */
const COPIED_MS = 2000;

export function CopyValue({ value }: { value: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      next = "error";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPIED_MS);
  }

  const text =
    state === "copied"
      ? "Copiado"
      : state === "error"
        ? "No se pudo copiar"
        : "Copiar";
  const Icon = state === "copied" ? Check : Copy;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Copiar valor ${value}`}
        onClick={copy}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <span className="text-caption">{text}</span>
      </Button>
      <output aria-live="polite" className="sr-only">
        {state === "idle" ? "" : text}
      </output>
    </>
  );
}
