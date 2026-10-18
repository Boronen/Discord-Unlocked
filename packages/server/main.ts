import { runtime } from "./runtime.js";
import { createApp } from "./app.js";
import { publishMediaResult } from "./publisher.js";
import { maintain } from "./maintenance.js";
import { loadPrivacyNotice } from "./privacy-notice.js";
const context = await runtime();
const app = await createApp(
  context.service,
  context.files,
  true,
  context.config.TRUST_PROXY,
  context.config.STUDIO_V2_ENABLED,
  await loadPrivacyNotice(context.config.PRIVACY_NOTICE_FILE),
);
await maintain(context.service, context.files);
await app.listen({ host: context.config.HOST, port: context.config.PORT });
let closing = false;
let maintaining = false,
  lastMaintenance = 0;
const timer = setInterval(async () => {
  if (maintaining || closing) return;
  maintaining = true;
  try {
    while (await publishMediaResult(context.service, context.files)) {}
    if (Date.now() - lastMaintenance > 60_000) {
      await maintain(context.service, context.files);
      lastMaintenance = Date.now();
    }
  } catch {
    app.log.error({ code: "MAINTENANCE_FAILED" }, "Media publication or retention needs operator attention.");
  } finally {
    maintaining = false;
  }
}, 1000);
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await app.close();
  await context.close();
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
