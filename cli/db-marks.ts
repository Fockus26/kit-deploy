/**
 * Writes `/etc/kit-deploy/dbs/<database>` (lib/core/db-marker) for `kit-deploy db adopt`. Root
 * only: the directory is root 0700 and the file root 0600, like kit-agent's own (it reads them as
 * root; nobody else reads or writes them).
 */
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import {
  DB_MARKERS_DIR,
  dbMarkerContent,
  dbMarkerPath,
} from "../lib/core/db-marker";

export async function writeDbMarker(database: string): Promise<void> {
  const path = dbMarkerPath(database);
  await mkdir(DB_MARKERS_DIR, { recursive: true, mode: 0o700 });
  await chmod(DB_MARKERS_DIR, 0o700);
  const tmp = `${path}.tmp`;
  await rm(tmp, { force: true });
  await writeFile(tmp, dbMarkerContent("adopted", new Date()), {
    flag: "wx",
    mode: 0o600,
  });
  // The mode above is cut by the caller's umask; set it whole.
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}
