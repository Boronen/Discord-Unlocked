import type { AutomationRule } from "./studio-model.js";
export interface PresenceSnapshot {
  status: string;
  music: boolean;
  games: string[];
}
export function matchRule(rules: AutomationRule[], state: PresenceSnapshot) {
  return (
    rules.find(
      (r) =>
        r.enabled &&
        (r.kind === "game"
          ? state.games.includes(r.applicationId)
          : r.kind === "music"
            ? state.music
            : state.status === r.kind),
    )?.presetId ?? null
  );
}
/** One stable target, one in-flight request. No activity is sent to the API. */
export class AutomationController {
  private candidate: string | null = null;
  private since = 0;
  private sent = 0;
  private version = -1;
  private running = false;
  constructor(
    private send: (presetId: string | null) => Promise<unknown>,
    private now = () => Date.now(),
  ) {}
  async tick(enabled: boolean, version: number, rules: AutomationRule[], state: PresenceSnapshot) {
    if (!enabled) {
      this.candidate = null;
      this.version = version;
      this.sent = 0;
      return;
    }
    const target = matchRule(rules, state),
      now = this.now();
    if (version !== this.version || target !== this.candidate) {
      this.version = version;
      this.candidate = target;
      this.since = now;
      this.sent = 0;
      return;
    }
    if (this.running || now - this.since < 20_000 || (this.sent && now - this.sent < 30_000)) return;
    this.running = true;
    try {
      await this.send(target);
      this.sent = now;
    } finally {
      this.running = false;
    }
  }
}
