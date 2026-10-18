import { runtime } from "./runtime.js";
import { snowflake } from "../shared/schema.js";
import { readFile } from "node:fs/promises";
import { accountZip } from "../shared/domain/export-zip.js";
const [action, id, verification] = process.argv.slice(2);
if (!["export", "delete"].includes(action ?? "") || verification !== "--identity-verified")
  throw new Error(
    "Usage: privacy-admin.js export|delete <verified-Discord-user-id> --identity-verified. Verify the same account privately first; never accept a claimed ID alone.",
  );
const userId = snowflake.parse(id),
  context = await runtime();
try {
  if (action === "delete") {
    await context.service.deleteAccount(userId);
    console.log("Verified data-subject erasure queued; access revoked immediately.");
  } else {
    const data = await context.service.exportData(userId),
      files: { name: string; data: Uint8Array }[] = [];
    for (const row of await context.service.db.query(
      "SELECT id,output_key,mime FROM media WHERE owner_id=$1 AND status='ready'",
      [userId],
    )) {
      const extension = row.mime === "audio/ogg" ? "ogg" : "webp",
        name = `media/${row.id}.${extension}`;
      files.push({ name, data: await readFile(context.files.path(row.output_key)) });
      const asset = data.media.find((v) => v.id === row.id);
      if (asset) asset.url = name;
    }
    files.push({ name: "account.json", data: new TextEncoder().encode(JSON.stringify(data, null, 2)) });
    process.stdout.write(accountZip(files));
  }
} finally {
  await context.close();
}
