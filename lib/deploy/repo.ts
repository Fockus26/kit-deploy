/** What the switch needs from the database. `drizzleSwitchRepo` is the real one. */
import type { Redirect } from "@/lib/core/caddy";
import type { Sealed } from "@/lib/core/crypto";
import type { DeploymentStatus } from "@/lib/db/schema";

export type ClaimedDeployment = {
  id: string;
  sha: string;
  /** 1 for a commit's first deployment; a redeploy takes the next (container `…-g<n>`). */
  generation: number;
  image: string;
  /** The PR of a preview; null in production. */
  pr: number | null;
  /** `repo`: GitHub `owner/name`, where the commit status goes. */
  project: { id: string; name: string; repo: string; memoryMb: number };
  /** The project's production hosts (`domains`); a preview's host is derived (`previewHost`). */
  hosts: string[];
  /** Hosts that only 308 to one of `hosts` (D028); absent = none. */
  redirects?: Redirect[];
};

/** A production deployment whose container still exists (live or kept for rollback). */
export type KeptDeployment = {
  id: string;
  sha: string;
  status: DeploymentStatus;
  container: string;
  port: number | null;
  createdAt: Date;
};

/** A preview whose container still exists: live, or asleep with a container a failed stop left. */
export type RunningPreview = {
  id: string;
  pr: number;
  status: "live" | "asleep";
  container: string;
  /** When the PR was last pushed: its newest deployment's `createdAt`. */
  lastPushAt: Date;
};

/** A stored variable as the switch hands it to kit-agent: sealed, never opened here. */
export type SealedVar = { name: string; secret: boolean; sealed: Sealed };

export type ProjectInfo = {
  id: string;
  name: string;
  /** GitHub `owner/name`: the image of a commit is derived from it. */
  repo: string;
  memoryMb: number;
  hosts: string[];
  redirects?: Redirect[];
};

export type LiveSite = {
  deploymentId: string;
  project: string;
  hosts: string[];
  redirects?: Redirect[];
  container: string;
  port: number;
};

export interface SwitchRepo {
  /** Runs `fn` holding the project's lock: one switch per project at a time, across processes. */
  withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T>;
  /** The project's newest queued deployment (production or any PR), now `starting`; older queued
   * ones of the same scope (production, or that PR) → `superseded`. */
  claimNext(projectId: string): Promise<ClaimedDeployment | null>;
  /** `live` with its container and port; the previous live (or asleep) one of the same scope →
   * `superseded`, and returned. */
  markLive(
    id: string,
    container: string,
    port: number,
  ): Promise<{ id: string; container: string | null } | null>;
  markFailed(id: string, error: string): Promise<void>;
  /** Production deployments that still have a container, newest first. */
  listKept(projectId: string): Promise<KeptDeployment[]>;
  /** Its container was removed (pruned, or moved to a newer row of the same commit). */
  clearContainer(id: string): Promise<void>;
  projectByName(name: string): Promise<ProjectInfo | null>;
  /** Every live production deployment, for `regenerate`. */
  liveSites(): Promise<LiveSite[]>;
  /** The project's previews that still have a container (live, or asleep whose container was not
   * removed yet), each PR once. Read under the project lock: it is what the limit counts. */
  runningPreviews(projectId: string): Promise<RunningPreview[]>;
  /** A live preview → `asleep` (D017); false if it was not live any more. Keeps its container
   * until `clearContainer`. */
  markAsleep(id: string): Promise<boolean>;
  /** The PR was closed: its open (queued, starting, live) and asleep preview deployments → `superseded`. Returns every
   * deployment of that PR that still has a container, for the switch to remove. */
  closePreview(
    projectId: string,
    pr: number,
  ): Promise<Array<{ id: string; container: string }>>;
  /** A redeploy (U8): a queued copy of the scope's live deployment (same commit and image, the next
   * generation), or null when nothing of that scope is live. */
  queueRedeploy(
    projectId: string,
    pr: number | null,
  ): Promise<{ id: string; sha: string; generation: number } | null>;
  /** The environment's variables (phase 04), for the container that is about to start. */
  envVars(
    projectId: string,
    environment: "production" | "preview",
  ): Promise<SealedVar[]>;
}
