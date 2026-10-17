/** Fetch through the native bridge; Discord must never receive HTTP media URLs. */
export class MediaUrlCache {
  private entries = new Map<string, { url?: string; users: Set<string>; retryAt: number }>();
  private generation = 0;
  constructor(
    private download: (url: string) => Promise<Blob>,
    private notify: (userId: string) => void,
    private isObserved: (userId: string) => boolean = () => false,
  ) {}
  resolve(source: string, userId: string): string | undefined {
    if (source.startsWith("blob:")) return source;
    let entry = this.entries.get(source);
    if (entry?.url) {
      entry.users.add(userId);
      return entry.url;
    }
    if (entry) {
      entry.users.add(userId);
      if (entry.retryAt > Date.now()) return undefined;
      this.entries.delete(source);
    }
    entry = { users: new Set([userId]), retryAt: Infinity };
    this.entries.set(source, entry);
    const generation = this.generation;
    const current = entry;
    void this.download(source)
      .then((blob) => {
        if (generation !== this.generation) return;
        current.url = URL.createObjectURL(blob);
        // Bound the recent media set; fetch again if an evicted profile is reopened.
        if (this.entries.size > 64)
          for (const [key, value] of this.entries) {
            if (key === source || !value.url || [...value.users].some(this.isObserved)) continue;
            URL.revokeObjectURL(value.url);
            this.entries.delete(key);
            if (this.entries.size <= 64) break;
          }
        current.users.forEach((id) => this.notify(id));
      })
      .catch(() => {
        if (generation === this.generation) current.retryAt = Date.now() + 10000;
      });
    return undefined;
  }
  clear() {
    ++this.generation;
    for (const entry of this.entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    this.entries.clear();
  }
}
