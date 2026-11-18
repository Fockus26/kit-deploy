import { cva } from "class-variance-authority";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Loader2,
  type LucideIcon,
  Moon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The states of HANDOFF §2 · StatusBadge. Always an icon and a word, never color alone. */
export type Status =
  | "active"
  | "ready"
  | "building"
  | "sleeping"
  | "saved"
  | "failed"
  | "error"
  | "verifying"
  | "issuing"
  | "warning";

type Tone = "success" | "info" | "neutral" | "destructive" | "warning";

const STATUS: Record<
  Status,
  { label: string; tone: Tone; icon: LucideIcon; spin?: boolean }
> = {
  active: { label: "Activo", tone: "success", icon: Check },
  ready: { label: "Listo", tone: "success", icon: Check },
  building: { label: "Construyendo", tone: "info", icon: Loader2, spin: true },
  sleeping: { label: "Dormido", tone: "neutral", icon: Moon },
  saved: { label: "Guardado", tone: "neutral", icon: Check },
  failed: { label: "Falló", tone: "destructive", icon: X },
  error: { label: "Error", tone: "destructive", icon: X },
  verifying: { label: "Verificando DNS", tone: "neutral", icon: CircleDashed },
  issuing: {
    label: "Emitiendo certificado",
    tone: "info",
    icon: Loader2,
    spin: true,
  },
  warning: { label: "Aviso", tone: "warning", icon: AlertTriangle },
};

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full text-caption font-medium",
  {
    variants: {
      tone: {
        success: "bg-success-surface text-success",
        info: "bg-info-surface text-info",
        neutral: "bg-raised text-muted-foreground",
        destructive: "bg-destructive-surface text-destructive",
        warning: "bg-warning-surface text-warning",
      },
      size: {
        default: "h-6 px-2.5",
        table: "h-5.5 px-2",
      },
    },
    defaultVariants: { tone: "neutral", size: "default" },
  },
);

export function StatusBadge({
  status,
  size,
  label,
  className,
}: {
  status: Status;
  size?: "default" | "table";
  /** Overrides the word when the page has a more specific one (e.g. "Certificado por vencer"). */
  label?: string;
  className?: string;
}) {
  const { label: text, tone, icon: Icon, spin } = STATUS[status];
  return (
    <span className={cn(badge({ tone, size }), className)} data-status={status}>
      <Icon
        aria-hidden="true"
        strokeWidth={3}
        className={cn(
          "size-3",
          spin && "animate-spin motion-reduce:animate-none",
        )}
      />
      {label ?? text}
    </span>
  );
}
