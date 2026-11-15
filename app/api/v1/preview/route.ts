import { after } from "next/server";
import { handleClosePreview } from "@/lib/api/deploy";
import { drizzleStore } from "@/lib/db/store";
import { switchDeps } from "@/lib/deploy/runtime";
import { closePreview } from "@/lib/deploy/switch";

/** The PR was closed: 202 at once, the preview's file and containers go after the response. */
export async function DELETE(request: Request): Promise<Response> {
  return handleClosePreview(request, drizzleStore(), {
    onClosed: (project, pr) =>
      after(async () => {
        try {
          await closePreview(switchDeps(), project, pr);
        } catch (e) {
          console.error("preview close:", e instanceof Error ? e.message : e);
        }
      }),
  });
}
