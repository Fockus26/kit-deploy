/** What the switch needs from the database. `drizzleSwitchRepo` is the real one. */
import type { DeploymentStatus } from "@/lib/db/schema";

export type ClaimedDeployment = {
  id: string;
  sha: string;
  image: string;
  /** The PR of a preview; null in production. */
  pr: number | null;
  /** `repo`: GitHub `owner/name`, where the commit status goes. */
  project: { id: string; name: string; repo: string; memoryMb: number };
  /** The project's production hosts (`domains`); a preview's host is derived (`previewHost`). */
  hosts: string[];
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

export type ProjectInfo = {
  id: string;
  name: string;
  /** GitHub `owner/name`: the image of a commit is derived from it. */
  repo: string;
  memoryMb: number;
  hosts: string[];
};

export type LiveSite = {
  deploymentId: string;
  project: string;
  hosts: string[];
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
}
