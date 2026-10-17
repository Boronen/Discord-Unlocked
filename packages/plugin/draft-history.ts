import type { ProfileConfig } from "./model.js";
export interface DraftBackup {
  name?: string;
  version: 1;
  userId: string;
  base: string;
  presetId: string;
  serverVersion: number;
  savedAt: string;
  config: ProfileConfig;
}
export interface DraftStorage {
  load(user: string, base: string, preset: string): Promise<DraftBackup | null>;
  save(value: DraftBackup): Promise<void>;
  remove(user: string, base: string, preset?: string): Promise<void>;
}
export class DraftHistory {
  past: ProfileConfig[] = [];
  future: ProfileConfig[] = [];
  private group = "";
  private changedAt = 0;
  private gesture = false;
  constructor(public present: ProfileConfig) {
    this.present = structuredClone(present);
  }
  begin() {
    this.gesture = true;
    this.group = "";
  }
  end() {
    this.gesture = false;
    this.group = "";
  }
  push(value: ProfileConfig, group = "edit", now = Date.now()) {
    if (JSON.stringify(value) === JSON.stringify(this.present)) return;
    if (this.group !== group || (!this.gesture && now - this.changedAt > 500)) {
      this.past.push(structuredClone(this.present));
      if (this.past.length > 100) this.past.shift();
    }
    this.group = group;
    this.changedAt = now;
    this.present = structuredClone(value);
    this.future = [];
  }
  undo() {
    if (this.past.length) {
      this.future.push(this.present);
      this.present = this.past.pop()!;
      this.group = "";
    }
    return structuredClone(this.present);
  }
  redo() {
    if (this.future.length) {
      this.past.push(this.present);
      this.present = this.future.pop()!;
      this.group = "";
    }
    return structuredClone(this.present);
  }
}
