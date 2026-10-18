import { mkdir, writeFile, readFile, unlink, stat, statfs } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { invariant } from "./errors.js";
import type { ProfileService } from "./service.js";
import type { MediaSlot } from "../shared/domain/model.js";
import { MAX_UPLOAD_BYTES } from "../shared/schema.js";
const run = promisify(execFile);
sharp.concurrency(1);
sharp.cache(false);
export class FileStore {
  constructor(public root: string) {}
  path(key: string) {
    invariant(
      /^(quarantine|staging|processed)\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(key),
      400,
      "INVALID_FILE",
      "Invalid file reference.",
    );
    const path = resolve(this.root, key);
    invariant(
      path.startsWith(resolve(this.root) + (process.platform === "win32" ? "\\" : "/")),
      400,
      "INVALID_FILE",
      "Invalid file reference.",
    );
    return path;
  }
  async init(areas = ["quarantine", "staging", "processed"]) {
    for (const area of areas) await mkdir(join(this.root, area), { recursive: true, mode: 0o700 });
  }
  async write(key: string, data: Buffer) {
    await writeFile(this.path(key), data, { flag: "wx", mode: 0o600 });
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
export async function enqueueMedia(
  service: ProfileService,
  files: FileStore,
  userId: string,
  slot: MediaSlot,
  data: Buffer,
  name: string,
) {
  await service.permissions.member(userId);
  invariant(
    data.length > 0 && data.length <= MAX_UPLOAD_BYTES,
    413,
    "FILE_SIZE",
    "Upload a non-empty file no larger than 15 MiB.",
  );
  await service.ensureUser(userId);
  for (const area of ["quarantine", "staging", "processed"]) {
    const capacity = await statfs(join(files.root, area));
    invariant(
      capacity.bavail * capacity.bsize >= (area === "processed" ? 256 : 64) * 1024 * 1024,
      507,
      "STORAGE_FULL",
      "Uploads are paused because storage is low. Contact the operator.",
    );
  }
  const id = randomUUID(),
    inputKey = `quarantine/${id}.bin`;
  try {
    return await service.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(73812025)");
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const [quota] = await tx.query(
        "SELECT count(*)::integer AS count,COALESCE(sum(input_bytes+output_bytes+preview_bytes),0)::bigint AS bytes,count(*) FILTER(WHERE status='processing')::integer AS pending FROM media WHERE owner_id=$1",
        [userId],
      );
      invariant(
        Number(quota!.bytes) + data.length + 2 * MAX_UPLOAD_BYTES <= 100 * 1024 * 1024,
        429,
        "MEDIA_QUOTA",
        "Your 100 MiB storage allowance is full. Reserved processing space is included. Contact a moderator.",
      );
      invariant(
        quota!.count < 200,
        429,
        "MEDIA_COUNT",
        "The 200-file limit is full. Wait for unused files to expire or contact a moderator.",
      );
      invariant(quota!.pending < 1, 429, "UPLOAD_PENDING", "Wait for your current upload to finish.");
      const [daily] = await tx.query(
        "SELECT count(*)::integer AS count FROM upload_events WHERE user_id=$1 AND created_at>now()-interval '24 hours'",
        [userId],
      );
      invariant(
        daily!.count < 10,
        429,
        "DAILY_QUOTA",
        "You can upload 10 files in a rolling 24-hour period.",
      );
      const [waiting] = await tx.query(
        "SELECT count(*)::integer AS count FROM media WHERE status='processing'",
      );
      invariant(waiting!.count < 10, 429, "QUEUE_FULL", "The processing queue is full. Try again later.");
      await files.write(inputKey, data);
      const [asset] = await tx.query(
        "INSERT INTO media(id,owner_id,slot,status,original_name,input_key,input_bytes) VALUES($1,$2,$3,'processing',$4,$5,$6) RETURNING *",
        [id, userId, slot, "upload", inputKey, data.length],
      );
      await tx.query("INSERT INTO upload_events(id,user_id) VALUES($1,$2)", [id, userId]);
      return service.media(asset!);
    });
  } catch (error) {
    await files.remove(inputKey);
    throw error;
  }
}
/** Bot attachment downloads never follow redirects or arbitrary hosts. */
export async function downloadAttachment(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  invariant(
    parsed.protocol === "https:" &&
      parsed.hostname === "cdn.discordapp.com" &&
      /^\/(?:attachments|ephemeral-attachments)\//.test(parsed.pathname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port,
    400,
    "INVALID_ATTACHMENT",
    "Only Discord attachments can be uploaded.",
  );
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  invariant(
    response.ok && response.body,
    400,
    "ATTACHMENT_FAILED",
    "The attachment could not be downloaded. Upload it again.",
  );
  invariant(
    Number(response.headers.get("content-length") ?? 0) <= MAX_UPLOAD_BYTES,
    413,
    "FILE_SIZE",
    "Files must be no larger than 15 MiB.",
  );
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        invariant(false, 413, "FILE_SIZE", "Files must be no larger than 15 MiB.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function signature(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (/^GIF8[79]a/.test(data.subarray(0, 6).toString())) return "gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (data.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (data.toString("ascii", 0, 3) === "ID3" || (data[0] === 255 && ((data[1] ?? 0) & 224) === 224))
    return "mp3";
  return "unknown";
}
export interface Tools {
  ffmpeg: string;
  ffprobe: string;
}
export function mediaFailureMessage(error: unknown) {
  if (error instanceof Error && "status" in error) return error.message;
  if (error instanceof Error && /ENOSPC|No space left on device/i.test(error.message))
    return "The processor ran out of temporary storage. Contact an admin, then upload the file again.";
  return "The media could not be decoded or exceeded processing limits. Upload another file.";
}
export async function processMediaJob(
  service: Pick<ProfileService, "db">,
  files: FileStore,
  tools: Tools,
): Promise<boolean> {
  const [row] = await service.db.query("SELECT * FROM claim_media_job()");
  if (!row) return false;
  let outputKey: string | null = null,
    previewKey: string | null = null;
  try {
    invariant(
      row.attempts < 3,
      400,
      "MEDIA_RETRIES",
      "File processing was interrupted repeatedly. Upload it again.",
    );
    const input = await readFile(files.path(row.input_key));
    const format = signature(input);
    let mime = "",
      animated = false,
      duration: number | null = null,
      width: number | null = null,
      height: number | null = null;
    if (row.slot === "audio") {
      invariant(
        ["wav", "ogg", "mp3"].includes(format),
        400,
        "AUDIO_FORMAT",
        "Upload an MP3, WAV or OGG audio file.",
      );
      const { stdout } = await run(
        tools.ffprobe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_entries",
          "format=duration:stream=codec_type,duration",
          "-of",
          "json",
          files.path(row.input_key),
        ],
        { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true },
      );
      const probe = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: { codec_type: string; duration?: string }[];
      };
      invariant(
        probe.streams?.some((s) => s.codec_type === "audio") &&
          !probe.streams?.some((s) => s.codec_type === "video"),
        400,
        "AUDIO_FORMAT",
        "The file must contain audio only.",
      );
      duration = Number(
        probe.format?.duration ?? probe.streams?.find((s) => s.codec_type === "audio")?.duration,
      );
      invariant(
        Number.isFinite(duration) && duration >= 3 && duration <= 5.05,
        400,
        "AUDIO_DURATION",
        "Profile sounds must be 3–5 seconds long.",
      );
      outputKey = `staging/${row.lease_token}.ogg`;
      await run(
        tools.ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          files.path(row.input_key),
          "-map",
          "0:a:0",
          "-map_metadata",
          "-1",
          "-t",
          "5",
          "-af",
          "loudnorm=I=-20:TP=-3:LRA=7",
          "-c:a",
          "libopus",
          "-b:a",
          "96k",
          "-y",
          files.path(outputKey),
        ],
        { timeout: 30000, maxBuffer: 256 * 1024, windowsHide: true },
      );
      mime = "audio/ogg";
    } else {
      invariant(
        ["png", "gif", "webp"].includes(format),
        400,
        "IMAGE_FORMAT",
        "Upload a PNG/APNG, GIF or WebP image.",
      );
      // libvips enforces decoded-pixel limits before image allocation.
      const metadata = await sharp(input, { animated: true, limitInputPixels: 50_000_000 }).metadata();
      const pages = metadata.pages ?? 1;
      width = metadata.width ?? 0;
      height = metadata.pageHeight ?? metadata.height ?? 0;
      invariant(
        width > 0 &&
          height > 0 &&
          width <= 2048 &&
          height <= 2048 &&
          pages <= 300 &&
          width * height * pages <= 50_000_000,
        400,
        "IMAGE_BUDGET",
        "Images must be at most 2048×2048 pixels and 300 frames, with at most 50 million decoded pixels in total.",
      );
      const apng = format === "png" && input.includes(Buffer.from("acTL"));
      if (apng && pages === 1) {
        // libvips may expose APNG as one page: probe the animation explicitly.
        const { stdout } = await run(
          tools.ffprobe,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames,width,height",
            "-of",
            "json",
            files.path(row.input_key),
          ],
          { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true },
        );
        const count = Number(JSON.parse(stdout).streams?.[0]?.nb_read_frames ?? 0);
        invariant(
          count > 0 && count <= 300 && width * height * count <= 50_000_000,
          400,
          "IMAGE_BUDGET",
          "The APNG contains too many frames.",
        );
        animated = count > 1;
        outputKey = `staging/${row.lease_token}.webp`;
        await run(
          tools.ffmpeg,
          [
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            files.path(row.input_key),
            "-map_metadata",
            "-1",
            "-c:v",
            "libwebp_anim",
            "-loop",
            "0",
            "-y",
            files.path(outputKey),
          ],
          { timeout: 30000, maxBuffer: 256 * 1024, windowsHide: true },
        );
      } else {
        animated = pages > 1;
        outputKey = `staging/${row.lease_token}.webp`;
        await sharp(input, { animated: true, limitInputPixels: 50_000_000 })
          .timeout({ seconds: 20 })
          .webp({ quality: 85, effort: 3 })
          .toFile(files.path(outputKey));
      }
      mime = "image/webp";
      previewKey = `staging/${row.lease_token}.png`;
      // Intro frames are often blank; use the middle frame for reduced motion.
      await sharp(input, { page: Math.floor(pages / 2), pages: 1, limitInputPixels: 50_000_000 })
        .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
        .png()
        .toFile(files.path(previewKey));
    }
    const outputBytes = (await stat(files.path(outputKey!))).size,
      previewBytes = previewKey ? (await stat(files.path(previewKey))).size : 0;
    invariant(
      outputBytes > 0 && outputBytes <= MAX_UPLOAD_BYTES && previewBytes <= MAX_UPLOAD_BYTES,
      413,
      "OUTPUT_SIZE",
      "The processed file exceeds 15 MiB. Upload a smaller file.",
    );
    await service.db.query("SELECT report_media_job($1,$2,$3::jsonb)", [
      row.id,
      row.lease_token,
      JSON.stringify({ ok: true, outputKey, previewKey, mime, animated, duration, width, height }),
    ]);
  } catch (error) {
    const message = mediaFailureMessage(error);
    console.error("Media processing failed within decoder limits.");
    await service.db.query("SELECT report_media_job($1,$2,$3::jsonb)", [
      row.id,
      row.lease_token,
      JSON.stringify({ ok: false, error: message }),
    ]);
    if (outputKey) await files.remove(outputKey);
    if (previewKey) await files.remove(previewKey);
  }
  return true;
}
