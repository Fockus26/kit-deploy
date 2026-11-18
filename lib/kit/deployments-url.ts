/** The Despliegues page's URL for a filter: `?env=preview` and `?status=failed`, nothing by default. */
import type { DeploymentStatus } from "@/lib/db/schema";

type Env = "production" | "preview";

export function deploymentsHref(
  project: string,
  env: Env,
  status?: DeploymentStatus,
): string {
  const qs = new URLSearchParams();
  if (env !== "production") qs.set("env", env);
  if (status) qs.set("status", status);
  const q = qs.toString();
  return `/p/${project}/deployments${q ? `?${q}` : ""}`;
}
