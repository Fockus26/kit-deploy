"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CommandLine } from "./command-line";
import { Notice } from "./notice";

/**
 * HANDOFF §3 "Nuevo proyecto": a deploy token, shown once. It lives only in the caller's state
 * (the action's result); "Ya lo guardé" is the caller's `onDone`, which must drop it from that
 * state. Focus lands on the title when it appears, so the change is announced.
 */
export function TokenOnce({
  title,
  token,
  children,
  onDone,
  level = 2,
}: {
  title: string;
  /** The title's heading level: 3 inside a page section that already has its h2. */
  level?: 2 | 3;
  /** `kdt_…` */
  token: string;
  /** What to do with it (commands, hosts). */
  children?: React.ReactNode;
  onDone: () => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = level === 3 ? "h3" : "h2";
  useEffect(() => heading.current?.focus(), []);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <Heading
        ref={heading}
        id={titleId}
        tabIndex={-1}
        className={`font-semibold ${level === 3 ? "text-h3" : "text-h2"} [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2`}
      >
        {title}
      </Heading>
      <Notice tone="warning" title="Cópialo ahora: no se vuelve a mostrar.">
        El panel solo guarda su huella. Si lo pierdes, revócalo en Ajustes y
        crea otro.
      </Notice>
      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-body">Token</p>
        <CommandLine command={token} />
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDone}>Ya lo guardé</Button>
      </div>
    </section>
  );
}
