import type { PublicProfile } from "./model.js";
type Listener = () => void;
export class ProfileCache {
  private entries = new Map<string, PublicProfile | null>();
  private listeners = new Map<string, Set<Listener>>();
  private wanted = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private alive = true;
  private epoch = 0;
  private loading = false;
  error: string | null = null;
  constructor(private fetchProfiles: (ids: string[]) => Promise<Record<string, PublicProfile | null>>) {}
  get(id: string) {
    return this.entries.get(id) ?? null;
  }
  has(id: string) {
    return this.entries.has(id);
  }
  notify(id: string) {
    this.listeners.get(id)?.forEach((fn) => fn());
  }
  isObserved(id: string) {
    return this.listeners.has(id);
  }
  observe(id: string, listener: Listener) {
    const set = this.listeners.get(id) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(id, set);
    if (!this.entries.has(id)) this.want(id);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(id);
    };
  }
  want(id: string) {
    if (!this.alive || !/^\d{17,20}$/.test(id)) return;
    this.wanted.add(id);
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 30);
  }
  start() {
    clearInterval(this.interval);
    this.alive = true;
    for (const id of this.listeners.keys()) this.want(id);
    this.interval = setInterval(() => {
      for (const id of this.listeners.keys()) this.wanted.add(id);
      void this.flush();
    }, 25000);
  }
  async flush() {
    if (this.loading || !this.alive) return;
    const epoch = this.epoch;
    this.loading = true;
    try {
      while (this.wanted.size && this.alive && epoch === this.epoch) {
        const ids = [...this.wanted].slice(0, 100);
        ids.forEach((id) => this.wanted.delete(id));
        const values = await this.fetchProfiles(ids);
        if (!this.alive || epoch !== this.epoch) return;
        for (const id of ids) {
          this.entries.set(id, values[id] ?? null);
          this.listeners.get(id)?.forEach((fn) => fn());
        }
        this.error = null;
        // Keep mounted profiles and a bounded recent set, never an entire directory.
        if (this.entries.size > 1000)
          for (const key of this.entries.keys()) {
            if (!this.listeners.has(key)) this.entries.delete(key);
            if (this.entries.size <= 750) break;
          }
      }
    } catch (error) {
      if (this.alive && epoch === this.epoch)
        this.error = error instanceof Error ? error.message : "Connection error";
    } finally {
      this.loading = false;
      if (this.alive && this.wanted.size && !this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.flush();
        }, 1000);
    }
  }
  clear() {
    ++this.epoch;
    this.entries.clear();
    for (const [id, list] of this.listeners) {
      this.wanted.add(id);
      list.forEach((fn) => fn());
    }
    if (this.alive) void this.flush();
  }
  stop() {
    this.alive = false;
    ++this.epoch;
    clearTimeout(this.timer);
    clearInterval(this.interval);
    this.timer = undefined;
    this.wanted.clear();
    this.entries.clear();
    this.listeners.forEach((list) => list.forEach((fn) => fn()));
  }
}
