interface Entry {
  url?: string;
  bytes: number;
  users: Set<string>;
  leases: Map<AbortSignal | symbol, () => void>;
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (error: Error) => void;
  state: "queued" | "loading" | "ready";
}
interface CacheLimits {
  bytes: number;
  entries: number;
  concurrent: number;
  queued: number;
}
const defaults: CacheLimits = { bytes: 64 * 1024 * 1024, entries: 64, concurrent: 4, queued: 128 };
const canceled = () => new Error("The media request was canceled.");

/** Native downloads only. Budgets apply to idle blobs; mounted consumers own leases. */
export class MediaUrlCache {
  private entries = new Map<string, Entry>();
  private queue = new Map<string, Entry>();
  private failures = new Map<string, number>();
  private loading = 0;
  private bytes = 0;
  private unscopedOwner = Symbol("until clear");
  private limits: CacheLimits;
  constructor(
    private download: (url: string) => Promise<Blob>,
    private notify: (userId: string) => void = () => {},
    private isObserved: (userId: string) => boolean = () => false,
    limits: Partial<CacheLimits> = {},
  ) {
    this.limits = { ...defaults, ...limits };
  }
  private pinned(entry: Entry) {
    return entry.leases.size > 0 || [...entry.users].some(this.isObserved);
  }
  private touch(source: string, entry: Entry) {
    this.entries.delete(source);
    this.entries.set(source, entry);
  }
  private remove(source: string, entry: Entry) {
    if (this.entries.get(source) !== entry) return;
    this.entries.delete(source);
    this.queue.delete(source);
    if (entry.url) {
      URL.revokeObjectURL(entry.url);
      this.bytes -= entry.bytes;
    }
    entry.leases.forEach((detach) => detach());
    entry.leases.clear();
    entry.reject(canceled());
  }
  /** Call after consumers unmount, as well as after downloads settle. */
  prune() {
    for (const [source, entry] of this.entries) {
      if (this.pinned(entry)) continue;
      if (
        entry.state !== "ready" ||
        this.bytes > this.limits.bytes ||
        this.entries.size > this.limits.entries
      )
        this.remove(source, entry);
    }
  }
  private ensure(source: string): Entry {
    const cached = this.entries.get(source);
    if (cached) {
      this.touch(source, cached);
      return cached;
    }
    if (this.queue.size >= this.limits.queued) throw new Error("Too many media previews are waiting.");
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const promise = new Promise<string>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    // resolve() callers receive notifications rather than awaiting this promise.
    void promise.catch(() => {});
    const entry: Entry = {
      bytes: 0,
      users: new Set(),
      leases: new Map(),
      promise,
      resolve,
      reject,
      state: "queued",
    };
    this.entries.set(source, entry);
    this.queue.set(source, entry);
    return entry;
  }
  private pump() {
    while (this.loading < this.limits.concurrent && this.queue.size) {
      const [source, entry] = this.queue.entries().next().value!;
      this.queue.delete(source);
      entry.state = "loading";
      this.loading++;
      void (async () => {
        try {
          const blob = await this.download(source);
          if (this.entries.get(source) !== entry) return;
          entry.url = URL.createObjectURL(blob);
          entry.bytes = blob.size;
          this.bytes += blob.size;
          entry.state = "ready";
          entry.resolve(entry.url);
          entry.users.forEach((id) => {
            if (this.entries.get(source) === entry) this.notify(id);
          });
          this.prune();
        } catch (error) {
          if (this.entries.get(source) !== entry) return;
          // Bound failure metadata too; there is no per-entry retry timer.
          if (this.failures.size >= this.limits.entries)
            this.failures.delete(this.failures.keys().next().value!);
          this.failures.set(source, Date.now() + 10_000);
          entry.reject(error instanceof Error ? error : new Error("The media could not be loaded."));
          this.remove(source, entry);
        } finally {
          // Native IPC cannot be canceled. Keep slots occupied until those requests
          // settle, including across clear()/account changes.
          this.loading--;
          this.pump();
        }
      })();
    }
  }
  resolve(source: string, userId: string): string | undefined {
    if (source.startsWith("blob:")) return source;
    if ((this.failures.get(source) ?? 0) > Date.now()) return undefined;
    try {
      const entry = this.ensure(source);
      entry.users.add(userId);
      this.pump();
      return entry.url;
    } catch {
      return undefined;
    }
  }
  /** Abort after replacing/unmounting the view to release its URLs. */
  acquire(source: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.reject(canceled());
    const entry = this.ensure(source);
    const owner = signal ?? this.unscopedOwner;
    if (!entry.leases.has(owner)) {
      const release = () => {
        entry.leases.get(owner)?.();
        entry.leases.delete(owner);
        this.prune();
      };
      signal?.addEventListener("abort", release, { once: true });
      entry.leases.set(owner, () => signal?.removeEventListener("abort", release));
    }
    this.pump();
    return entry.promise.then((url) => {
      if (signal?.aborted || this.entries.get(source) !== entry) throw canceled();
      return url;
    });
  }
  clear() {
    for (const [source, entry] of this.entries) this.remove(source, entry);
    this.failures.clear();
  }
  get sizeBytes() {
    return this.bytes;
  }
}
