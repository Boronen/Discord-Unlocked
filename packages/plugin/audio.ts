export interface Playable {
  volume: number;
  currentTime: number;
  src: string;
  play(): Promise<void>;
  pause(): void;
}
/** Owns exactly one playback. Session identity prevents effect cleanup races. */
export class ProfileAudio {
  private current: { key: string; audio: Playable; blocked: boolean } | null = null;
  private generation = 0;
  constructor(private create: (url: string) => Playable) {}
  async open(key: string, url: string, volume: number) {
    if (this.current?.key === key) return this.current.blocked;
    this.stop();
    const generation = ++this.generation;
    const audio = this.create(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const state = { key, audio, blocked: false };
    this.current = state;
    try {
      await audio.play();
    } catch {
      if (this.current === state) state.blocked = true;
    }
    if (generation !== this.generation) {
      audio.pause();
      audio.src = "";
    }
    return this.current === state && state.blocked;
  }
  async retry(key: string) {
    const current = this.current;
    if (!current || current.key !== key) return false;
    try {
      await current.audio.play();
      current.blocked = false;
    } catch {
      current.blocked = true;
    }
    return current.blocked;
  }
  volume(value: number) {
    if (this.current) this.current.audio.volume = Math.max(0, Math.min(1, value));
  }
  close(key: string) {
    if (this.current?.key === key) this.stop();
  }
  stop() {
    ++this.generation;
    if (this.current) {
      this.current.audio.pause();
      this.current.audio.src = "";
      this.current = null;
    }
  }
}
