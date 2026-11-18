/**
 * The projects the panel's navigation shows: names only, read on the server after the session
 * check. The real lists (status, domain, last deployment) come with the Inicio page.
 */
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { projects } from "@/lib/db/schema";
import { db } from "@/lib/db/store";
import { panelUser } from "./session";

export type PanelProject = { name: string };

/** The `projects_name_format` check (lib/db/schema.ts): anything else is not a project. */
export const PROJECT_NAME = /^[a-z0-9][a-z0-9_]{0,39}$/;

export const listProjects = cache(async (): Promise<PanelProject[]> => {
  await panelUser();
  return db()
    .select({ name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name));
});

export const findProject = cache(
  async (name: string): Promise<PanelProject | null> => {
    await panelUser();
    if (!PROJECT_NAME.test(name)) return null;
    const [row] = await db()
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.name, name))
      .limit(1);
    return row ?? null;
  },
);
