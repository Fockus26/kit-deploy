import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Button (new-york), on kit-deploy's tokens (HANDOFF §2). No `asChild`: links use
// buttonVariants. `loading` swaps the icon for a spinner, disables and sets aria-busy.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-body transition-colors duration-120 ease-default outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:bg-raised disabled:text-disabled",
        outline:
          "border border-input bg-card text-foreground hover:bg-raised active:bg-raised/70 disabled:border-border disabled:text-disabled",
        "destructive-text":
          "border border-input bg-card text-destructive hover:bg-raised active:bg-raised/70 disabled:border-border disabled:text-disabled",
        "destructive-solid":
          "bg-destructive-solid text-destructive-on hover:bg-destructive-solid/90 active:bg-destructive-solid/80 disabled:bg-raised disabled:text-disabled",
        ghost:
          "text-primary-text underline-offset-4 hover:underline disabled:text-disabled",
      },
      size: {
        default: "min-h-control px-4 py-2",
        sm: "min-h-8 px-3 text-caption",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <button
      data-slot="button"
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        loading && "[&_svg:not([data-spinner])]:hidden",
      )}
      {...props}
    >
      {loading ? (
        <Loader2
          data-spinner=""
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
