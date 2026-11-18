/**
 * Which kit-db databases kit-deploy owns (D048). A project's name is its database's, and kit-db
 * serves every database on the central Postgres: the name alone would hand a project another
 * client's database. So the agent gives `DATABASE_URL` and `db.status` details only for a database
 * with a root marker, `/etc/kit-deploy/dbs/<database>` (dir root 0700, file root 0600). kit-agent
 * writes it when `db.create` creates the database; `kit-deploy db adopt` (root, over ssh) writes
 * it for one that existed before. It holds no secret: how and when it was marked.
 */
import { CoreInputError } from "./validate";

export const DB_MARKERS_DIR = "/etc/kit-deploy/dbs";

/** A project's name or `<project>_preview` (what kit-db names them). */
const DATABASE = /^[a-z0-9][a-z0-9_]{0,47}$/;

export function dbMarkerPath(database: string): string {
  if (!DATABASE.test(database))
    throw new CoreInputError(`invalid database name "${database}"`);
  return `${DB_MARKERS_DIR}/${database}`;
}

/** Bigger than any marker this code writes; a bigger file is not one. */
export const DB_MARKER_MAX_BYTES = 1024;

export function dbMarkerContent(how: "created" | "adopted", at: Date): string {
  return `${how} by kit-deploy ${at.toISOString()}\n`;
}
