export function webhookUrl(value) {
  const url = new URL(value.trim());
  if (
    url.origin !== "https://discord.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)
  )
    throw new Error("Invalid Discord webhook URL.");
  return url.href;
}

export function notification(previous, failed, now) {
  if (failed) return !previous?.failed || now - previous.sentAt >= 3600000 ? "failure" : null;
  return previous?.failed ? "recovery" : null;
}

export async function deliver(url, content, request = fetch) {
  const response = await request(webhookUrl(url), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) throw new Error("Discord notification was not accepted.");
}
