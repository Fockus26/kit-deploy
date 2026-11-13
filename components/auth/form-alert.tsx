import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type Notice = {
  kind: "error" | "success";
  title: string;
  body?: string;
};

/**
 * Errors are announced (role="alert") and never color alone: icon + a word in the title.
 * Rendered always, empty when there is nothing, so screen readers pick up the change.
 */
export function FormAlert({ notice }: { notice: Notice | null }) {
  return (
    <div role="alert" aria-atomic="true">
      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "success"}
          className="mb-6"
        >
          {notice.kind === "error" ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CircleCheck aria-hidden="true" />
          )}
          <AlertTitle>{notice.title}</AlertTitle>
          {notice.body && <AlertDescription>{notice.body}</AlertDescription>}
        </Alert>
      )}
    </div>
  );
}
