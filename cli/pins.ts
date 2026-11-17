/**
 * Writes `/etc/kit-deploy/images/<project>` (lib/core/image-pin). Root only: the directory is
 * root 0755 and the file root 0644 (kit-agent reads it; nobody else writes it).
 */
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { IMAGE_PINS_DIR, parsePin, pinPath } from "../lib/core/image-pin";

export async function writePinFile(
  project: string,
  pin: string,
): Promise<void> {
  if (parsePin(pin) !== pin) throw new Error(`invalid pin ${pin}`);
  const path = pinPath(project);
  await mkdir(IMAGE_PINS_DIR, { recursive: true, mode: 0o755 });
  await chmod(IMAGE_PINS_DIR, 0o755);
  const tmp = `${path}.tmp`;
  await rm(tmp, { force: true });
  await writeFile(tmp, `${pin}\n`, { flag: "wx", mode: 0o644 });
  // The mode above is cut by the caller's umask (ssh root's may be 077).
  await chmod(tmp, 0o644);
  await rename(tmp, path);
}
