import { AlertCircle } from "lucide-react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** HANDOFF §2 · Field: visible label above, help (12 muted) and error (12 destructive + icon) below. */

type A11yProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

function useFieldIds(
  idProp: string | undefined,
  help: string | undefined,
  error: string | undefined,
) {
  const generated = useId();
  const id = idProp ?? generated;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return { id, helpId, errorId, describedBy };
}

function FieldMessages({
  helpId,
  errorId,
  help,
  error,
}: {
  helpId?: string;
  errorId?: string;
  help?: string;
  error?: string;
}) {
  return (
    <>
      {help ? (
        <p id={helpId} className="text-caption text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-caption text-destructive"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Label + control + messages; `children` receives the id and aria props to spread on the control. */
export function Field({
  label,
  help,
  error,
  id: idProp,
  className,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  id?: string;
  className?: string;
  children: (props: A11yProps) => React.ReactNode;
}) {
  const { id, helpId, errorId, describedBy } = useFieldIds(idProp, help, error);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      <FieldMessages
        help={help}
        error={error}
        helpId={helpId}
        errorId={errorId}
      />
    </div>
  );
}

type Common = {
  label: string;
  help?: string;
  error?: string;
  className?: string;
};

export function FieldInput({
  label,
  help,
  error,
  className,
  ...props
}: Common & Omit<React.ComponentProps<"input">, "className">) {
  return (
    <Field
      label={label}
      help={help}
      error={error}
      id={props.id}
      className={className}
    >
      {(a11y) => <Input {...props} {...a11y} />}
    </Field>
  );
}

export function FieldTextarea({
  label,
  help,
  error,
  className,
  ...props
}: Common & Omit<React.ComponentProps<"textarea">, "className">) {
  return (
    <Field
      label={label}
      help={help}
      error={error}
      id={props.id}
      className={className}
    >
      {(a11y) => <Textarea {...props} {...a11y} />}
    </Field>
  );
}

export function FieldCheckbox({
  label,
  help,
  error,
  className,
  ...props
}: Common & Omit<React.ComponentProps<typeof Checkbox>, "className" | "id">) {
  const { id, helpId, errorId, describedBy } = useFieldIds(
    undefined,
    help,
    error,
  );
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <Checkbox
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      <FieldMessages
        help={help}
        error={error}
        helpId={helpId}
        errorId={errorId}
      />
    </div>
  );
}

/** Radio group in a `fieldset` + `legend`; `options` are `{ value, label }`. */
export function FieldRadioGroup({
  legend,
  options,
  help,
  error,
  className,
  ...props
}: {
  legend: string;
  options: { value: string; label: string; disabled?: boolean }[];
  help?: string;
  error?: string;
  className?: string;
} & Omit<React.ComponentProps<typeof RadioGroup>, "className" | "children">) {
  const { id, helpId, errorId, describedBy } = useFieldIds(
    undefined,
    help,
    error,
  );
  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)}>
      <legend className="mb-1.5 font-medium text-body">{legend}</legend>
      <RadioGroup
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-2">
            <RadioGroupItem
              value={o.value}
              id={`${id}-${o.value}`}
              disabled={o.disabled}
              aria-invalid={error ? true : undefined}
            />
            <Label htmlFor={`${id}-${o.value}`}>{o.label}</Label>
          </div>
        ))}
      </RadioGroup>
      <FieldMessages
        help={help}
        error={error}
        helpId={helpId}
        errorId={errorId}
      />
    </fieldset>
  );
}
