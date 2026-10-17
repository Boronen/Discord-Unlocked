import { open, constants, stat } from "node:fs/promises";
import { z } from "zod";
import type { ProfileService } from "./service.js";
import { FileStore } from "./media.js";
import { MAX_UPLOAD_BYTES } from "../shared/schema.js";
import { invariant } from "./errors.js";
const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), error: z.string().max(1000) }).strict(),
  z
    .object({
      ok: z.literal(true),
      outputKey: z.string(),
      previewKey: z.string().nullable(),
      mime: z.enum(["image/webp", "audio/ogg"]),
      animated: z.boolean(),
      duration: z.number().min(3).max(5.05).nullable(),
      width: z.number().int().min(1).max(2048).nullable(),
      height: z.number().int().min(1).max(2048).nullable(),
    })
    .strict(),
]);
async function verifiedCopy(files: FileStore, source: string, destination: string, mime: string) {
  const handle = await open(files.path(source), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    invariant(
      info.isFile() && info.size > 0 && info.size <= MAX_UPLOAD_BYTES,
      400,
      "INVALID_OUTPUT",
      "Invalid processed file size.",
    );
    const buffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const part = await handle.read(buffer, length, buffer.length - length, null);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    invariant(length <= MAX_UPLOAD_BYTES, 413, "INVALID_OUTPUT", "Processed file exceeds its size limit.");
    const data = buffer.subarray(0, length);
    const valid =
      mime === "image/png"
        ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/webp"
          ? data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP"
          : data.toString("ascii", 0, 4) === "OggS";
    invariant(
      valid && data.length <= MAX_UPLOAD_BYTES,
      400,
      "INVALID_OUTPUT",
      "Invalid processed file format.",
    );
    await files.write(destination, data);
    return data.length;
  } finally {
    await handle.close();
  }
}
/** Only the API process can promote normalized staging files into the immutable final volume. */
export async function publishMediaResult(service: Pick<ProfileService, "db">, files: FileStore) {
  return service.db.transaction(async (tx) => {
    const [row] = await tx.query(
      "SELECT m.*,wr.result,wr.lease_token AS result_token FROM worker_results wr JOIN media m ON m.id=wr.asset_id ORDER BY wr.created_at FOR UPDATE OF m,wr SKIP LOCKED LIMIT 1",
    );
    if (!row) return false;
    const created: string[] = [];
    try {
      const result = resultSchema.parse(row.result);
      if (row.status !== "processing" || row.lease_token !== row.result_token) return true;
      if (!result.ok) {
        await tx.query("UPDATE media SET status='failed',error=$1,lease_until=NULL WHERE id=$2", [
          result.error,
          row.id,
        ]);
        return true;
      }
      const extension = result.mime === "audio/ogg" ? "ogg" : "webp";
      invariant(
        result.outputKey === `staging/${row.lease_token}.${extension}` &&
          result.previewKey === (extension === "webp" ? `staging/${row.lease_token}.png` : null),
        400,
        "INVALID_OUTPUT",
        "Invalid processed file reference.",
      );
      invariant(
        (row.slot === "audio") === (extension === "ogg"),
        400,
        "INVALID_OUTPUT",
        "Invalid processed media type.",
      );
      const output = `processed/${row.id}.${extension}`,
        preview = result.previewKey ? `processed/${row.id}.png` : null;
      created.push(output);
      const bytes = await verifiedCopy(files, result.outputKey, output, result.mime);
      let previewBytes = 0;
      if (preview && result.previewKey) {
        created.push(preview);
        previewBytes = await verifiedCopy(files, result.previewKey, preview, "image/png");
      }
      await tx.query(
        "UPDATE media SET status='ready',output_key=$1,preview_key=$2,mime=$3,animated=$4,duration=$5,width=$6,height=$7,lease_until=NULL,output_bytes=$8,preview_bytes=$9 WHERE id=$10 AND status='processing'",
        [
          output,
          preview,
          result.mime,
          result.animated,
          result.duration,
          result.width,
          result.height,
          bytes,
          previewBytes,
          row.id,
        ],
      );
    } catch {
      for (const key of created) await files.remove(key);
      await tx.query(
        "UPDATE media SET status='failed',error='The processed file failed validation.',lease_until=NULL WHERE id=$1 AND status='processing'",
        [row.id],
      );
    } finally {
      for (const key of [
        row.input_key,
        ...["webp", "png", "ogg"].map((ext) => `staging/${row.result_token}.${ext}`),
      ])
        await tx.query("INSERT INTO file_deletions(key) VALUES($1) ON CONFLICT DO NOTHING", [key]);
      await tx.query("DELETE FROM worker_results WHERE asset_id=$1", [row.id]);
    }
    return true;
  });
}
