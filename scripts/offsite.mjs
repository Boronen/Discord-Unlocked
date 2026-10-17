import { readFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
/** A marker created on the verified remote mount prevents an unavailable mount falling back to a local folder. */
export async function verifyOffsite(
  directory = process.env.OFFSITE_BACKUP_DIR,
  id = process.env.OFFSITE_BACKUP_ID,
) {
  if (!directory || !id || !/^[a-f0-9-]{36}$/i.test(id))
    throw new Error(
      "Configure an independently mounted OFFSITE_BACKUP_DIR and its verified OFFSITE_BACKUP_ID.",
    );
  const path = resolve(directory),
    workspace = resolve(".");
  if (path === workspace || path.startsWith(workspace + sep))
    throw new Error("Offsite storage must be outside the application workspace.");
  const marker = await readFile(join(path, ".profile-studio-offsite-id"), "utf8").catch(() => "");
  if (marker.trim() !== id)
    throw new Error(
      "The verified offsite mount is unavailable or its identity does not match. No local fallback copy is allowed.",
    );
  return path;
}
