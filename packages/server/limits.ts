import { invariant } from "./errors.js";
/** In-memory, bounded and ephemeral; no raw client address is persisted. Single API replica. */
export class AccountLimits {
  private buckets = new Map<string, { until: number; count: number }>();
  check(userId: string, category: string, max: number, windowMs = 60_000) {
    const now = Date.now(),
      key = `${category}:${userId}`;
    if (this.buckets.size > 2048)
      for (const [id, value] of this.buckets) if (value.until <= now) this.buckets.delete(id);
    if (this.buckets.size >= 2048 && !this.buckets.has(key))
      this.buckets.delete(this.buckets.keys().next().value!);
    const value = this.buckets.get(key);
    if (!value || value.until <= now) this.buckets.set(key, { until: now + windowMs, count: 1 });
    else invariant(++value.count <= max, 429, "RATE_LIMIT", "Too many requests. Try again shortly.");
  }
}
