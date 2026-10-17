/** Memory only, bounded by conservative UTF-16 string size. */
export class ArtworkCache {
  private entries = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private bytes = 0;
  private epoch = 0;
  constructor(private budget = 20 * 1024 * 1024) {}
  load(url: string, loader: (url: string) => Promise<string>): Promise<string> {
    const cached = this.entries.get(url);
    if (cached) {
      this.entries.delete(url);
      this.entries.set(url, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(url);
    if (pending) return pending;
    const epoch = this.epoch;
    const task = loader(url)
      .then((data) => {
        const size = data.length * 2;
        if (epoch === this.epoch && size <= this.budget) {
          while (this.bytes + size > this.budget && this.entries.size) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.length * 2;
            this.entries.delete(oldest);
          }
          this.entries.set(url, data);
          this.bytes += size;
        }
        return data;
      })
      .finally(() => {
        if (this.pending.get(url) === task) this.pending.delete(url);
      });
    this.pending.set(url, task);
    return task;
  }
  clear() {
    ++this.epoch;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  get sizeBytes() {
    return this.bytes;
  }
}
export const albumArtworkCache = new ArtworkCache();
