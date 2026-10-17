import { setTimeout } from "node:timers/promises";
import { loadWorkerConfig } from "./config.js";
import { postgres } from "./db.js";
import { processMediaJob, FileStore } from "./media.js";
const config = loadWorkerConfig(),
  connection = postgres(config.DATABASE_URL),
  files = new FileStore(config.MEDIA_ROOT);
await files.init(["staging"]);
let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
while (!stopping) {
  try {
    if (
      !(await processMediaJob({ db: connection.db }, files, {
        ffmpeg: config.FFMPEG_PATH,
        ffprobe: config.FFPROBE_PATH,
      }))
    )
      await setTimeout(1000);
  } catch (error) {
    console.error("The worker will retry a database or processing operation.");
    await setTimeout(3000);
  }
}
await connection.close();
