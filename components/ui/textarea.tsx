"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const supportsFieldSizing = () =>
  typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");

// shadcn/ui Textarea, same skin as Input (16px on touch screens so iOS does not zoom).
// It grows with its content (CSS `field-sizing`, a JS fallback where unsupported) up to
// `max-h-80`, then scrolls inside itself.
function Textarea({
  className,
  ref,
  onInput,
  ...props
}: React.ComponentProps<"textarea">) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);

  const fit = React.useCallback(() => {
    const el = inner.current;
    if (!el || supportsFieldSizing()) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Also covers a value set from outside (editing a variable, form reset).
  React.useLayoutEffect(fit);

  return (
    <textarea
      data-slot="textarea"
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      className={cn(
        "flex field-sizing-content min-h-24 w-full min-w-0 resize-none rounded-md border border-input bg-card px-3 py-2 text-input-touch text-foreground outline-none transition-colors duration-120 ease-default placeholder:text-muted-foreground md:text-body",
        "max-h-80 overflow-y-auto",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
