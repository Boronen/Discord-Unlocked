import type {
  CatalogItem,
  EditorState,
  ProfileConfig,
  ProfileRevision,
  PublicProfile,
  MediaAsset,
} from "./model.js";
import { MediaUrlCache } from "./media-cache.js";
export interface WireResponse {
  status: number;
  body: string;
  mime?: string;
}
export type Transport = (
  base: string,
  path: string,
  method: string,
  body: string | undefined,
  token: string | undefined,
  binary?: boolean,
) => Promise<WireResponse>;
export interface PendingPair {
  id: string;
  code: string;
  pollSecret: string;
  expiresIn: number;
  expiresAt: number;
  userId: string;
}
export interface SessionStorage {
  load(userId: string, base: string): Promise<string | null>;
  save(userId: string, base: string, token: string): Promise<void>;
  remove(userId: string, base: string): Promise<void>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function diagnosticOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : "Invalid API URL";
  } catch {
    return "Invalid API URL";
  }
}
export class StudioClient {
  studioV2 = false;
  musicPrioritySupported = false;
  token: string | undefined;
  userId: string | undefined;
  pendingPair: PendingPair | undefined;
  private blobs = new MediaUrlCache((url) => this.downloadMedia(url, false));
  private blobContext?: { base: string; token: string; generation: number };
  private listeners = new Set<() => void>();
  private restoring: Promise<boolean> | undefined;
  private restoreKey: string | undefined;
  private sessionGeneration = 0;
  private signedOut = new Set<string>();
  persistenceError: string | null = null;
  accessAllowed = false;
  get canView() {
    return !!this.token && !this.restoring && this.accessAllowed;
  }
  constructor(
    public base: string,
    private transport: Transport,
    private storage?: SessionStorage,
  ) {}
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const base = this.base,
      token = this.token;
    const response = await this.transport(
      base,
      path,
      method,
      body === undefined ? undefined : JSON.stringify(body),
      token,
    );
    if (base !== this.base || token !== this.token)
      throw new Error("The connection changed. Try the action again.");
    let value: any;
    try {
      value = JSON.parse(response.body);
    } catch {
      throw new ApiError(
        response.status,
        "INVALID_RESPONSE",
        "The service returned an invalid response. Check the API URL and try again.",
      );
    }
    if (response.status >= 400) {
      if (response.status === 401) this.disconnect();
      if (
        (response.status === 403 &&
          ["BETA_ROLE_REQUIRED", "NOT_MEMBER", "ACCOUNT_DELETED"].includes(value.code)) ||
        value.code === "BETA_CLOSED"
      ) {
        this.accessAllowed = false;
        this.clearBlobs();
        this.emit();
      }
      throw new ApiError(response.status, value.code ?? "REQUEST", value.message ?? "The request failed.");
    }
    return value as T;
  }
  async pair(userId: string) {
    ++this.sessionGeneration;
    this.restoring = undefined;
    this.restoreKey = undefined;
    const result = await this.request<{ id: string; code: string; pollSecret: string; expiresIn: number }>(
      "/v1/auth/pair",
      "POST",
      { userId },
    );
    this.pendingPair = { ...result, userId, expiresAt: Date.now() + result.expiresIn * 1000 };
    return this.pendingPair;
  }
  async poll(id: string, pollSecret: string) {
    const result = await this.request<{ ready: boolean; token?: string; userId?: string }>(
      "/v1/auth/poll",
      "POST",
      { id, pollSecret },
    );
    if (this.pendingPair?.id !== id) return false;
    if (result.ready) {
      this.pendingPair = undefined;
      this.token = result.token;
      this.userId = result.userId;
      this.signedOut.delete(`${this.base}:${result.userId}`);
      this.accessAllowed = true;
      this.persistenceError = null;
      if (this.storage && result.userId && result.token) {
        try {
          await this.storage.save(result.userId, this.base, result.token);
        } catch {
          this.persistenceError =
            "Connected, but encrypted storage failed. Pair again after restarting Discord.";
        }
      }
      this.emit();
    }
    return result.ready;
  }
  async logout() {
    const userId = this.userId,
      base = this.base,
      token = this.token;
    if (userId) this.signedOut.add(`${base}:${userId}`);
    this.disconnect();
    const removed = userId ? this.storage?.remove(userId, base) : Promise.resolve();
    const revoked = token
      ? this.transport(base, "/v1/auth/logout", "POST", undefined, token).then((response) => {
          if (response.status >= 500)
            throw new Error(
              "Disconnected locally. Server sign-out could not be confirmed; revoke this device from another signed-in device.",
            );
        })
      : Promise.resolve();
    await Promise.all([removed, revoked]);
  }
  async restore(userId: string): Promise<boolean> {
    if (this.signedOut.has(`${this.base}:${userId}`)) return false;
    if (this.token && this.userId === userId && !this.restoring) return true;
    if (!this.storage) return false;
    const base = this.base;
    const key = `${base}:${userId}`;
    if (this.restoring && this.restoreKey === key) return this.restoring;
    const generation = ++this.sessionGeneration;
    this.restoreKey = key;
    const task = (async () => {
      const token = await this.storage!.load(userId, base);
      if (!token || base !== this.base || generation !== this.sessionGeneration) return false;
      this.token = token;
      this.userId = userId;
      try {
        const state = await this.editor();
        if (state.userId !== userId)
          throw new ApiError(401, "WRONG_ACCOUNT", "The saved session belongs to another account.");
        if (base !== this.base || token !== this.token) return false;
        this.emit();
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await this.storage!.remove(userId, base);
          if (this.userId === userId && this.token === token) this.disconnect();
          return false;
        }
        // Preserve the encrypted session during an outage; the editor can retry.
        this.emit();
        throw error;
      }
    })().finally(() => {
      if (this.restoring === task) {
        this.restoring = undefined;
        this.restoreKey = undefined;
        this.emit();
      }
    });
    this.restoring = task;
    return task;
  }
  disconnect() {
    this.musicPrioritySupported = false;
    this.studioV2 = false;
    ++this.sessionGeneration;
    this.restoring = undefined;
    this.restoreKey = undefined;
    this.pendingPair = undefined;
    this.token = undefined;
    this.userId = undefined;
    this.accessAllowed = false;
    this.clearBlobs();
    this.emit();
  }
  setBase(base: string) {
    if (base !== this.base) {
      this.disconnect();
      this.base = base;
    }
  }
  editor() {
    return this.request<EditorState>(this.studioV2 ? "/v2/me" : "/v1/me").then((value) => {
      if (!this.accessAllowed) {
        this.accessAllowed = true;
        this.emit();
      }
      return value;
    });
  }
  save(config: ProfileConfig, version: number) {
    return this.request<{ version: number }>("/v1/me/draft", "PUT", { config, version });
  }
  submit(version: number, publish = false, confirmationId?: string) {
    return this.request<ProfileRevision>(
      publish ? "/v1/me/publish" : "/v1/me/submit",
      "POST",
      publish ? { version, confirmationId } : { version },
    );
  }
  beginPublishConfirmation(version: number) {
    return this.request<{ id: string; code: string; expiresIn: number }>(
      "/v1/me/publish-confirmation",
      "POST",
      { version },
    );
  }
  sessions() {
    return this.request<
      { id: string; name: string; createdAt: string; lastSeenAt: string; current: boolean }[]
    >("/v1/auth/sessions");
  }
  revokeSession(id?: string) {
    return this.request(id ? `/v1/auth/sessions/${id}` : "/v1/auth/sessions", "DELETE");
  }
  exportData() {
    return this.request<Record<string, unknown>>("/v1/privacy/export");
  }
  async deleteAccount() {
    await this.request("/v1/privacy/account", "DELETE", { confirmation: "DELETE MY ACCOUNT" });
    const id = this.userId,
      base = this.base;
    if (id) this.signedOut.add(`${base}:${id}`);
    this.disconnect();
    if (id) await this.storage?.remove(id, base);
  }
  profiles(ids: string[]) {
    if (!this.canView) return Promise.resolve({} as Record<string, PublicProfile | null>);
    return this.request<{ profiles: Record<string, PublicProfile | null> }>(
      `/v${this.studioV2 ? 2 : 1}/profiles?ids=${ids.join(",")}`,
    ).then((value) => value.profiles);
  }
  async catalog() {
    const items = new Map<string, CatalogItem>();
    const cursors = new Set<string>();
    let after: string | null = null;
    do {
      const page: { items: CatalogItem[]; nextCursor?: string | null } = await this.request(
        after
          ? `/v${this.studioV2 ? 2 : 1}/catalog?after=${encodeURIComponent(after)}`
          : `/v${this.studioV2 ? 2 : 1}/catalog`,
      );
      page.items.forEach((item) => items.set(item.id, item));
      if (
        page.nextCursor &&
        (!/^[a-zA-Z0-9_-]{1,100}$/.test(page.nextCursor) || cursors.has(page.nextCursor))
      )
        throw new Error("The catalog returned an invalid page. Try refreshing again.");
      after = page.nextCursor ?? null;
      if (after) cursors.add(after);
    } while (after);
    return [...items.values()];
  }
  resolveSong(url: string) {
    return this.request<import("./music-links.js").FavoriteSong>(
      `/v1/music/resolve?url=${encodeURIComponent(url)}`,
    );
  }
  review(id: string) {
    return this.request<{ revision: ProfileRevision; assets: MediaAsset[] }>(`/v1/moderation/${id}`);
  }
  importItem(item: CatalogItem) {
    return this.request("/v1/admin/catalog", "POST", item);
  }
  async importCatalog(items: CatalogItem[]) {
    for (let start = 0; start < items.length; start += 100)
      await this.request("/v1/admin/catalog/batch", "POST", items.slice(start, start + 100));
  }
  async privateMedia(url: string, signal?: AbortSignal) {
    if (!this.token) throw new Error("Pair your account to view media.");
    if (
      this.blobContext?.base !== this.base ||
      this.blobContext?.token !== this.token ||
      this.blobContext?.generation !== this.sessionGeneration
    ) {
      this.clearBlobs();
      this.blobContext = { base: this.base, token: this.token, generation: this.sessionGeneration };
    }
    return this.blobs.acquire(url, signal);
  }
  private async downloadMedia(url: string, publicView: boolean) {
    if (publicView ? !this.canView : !this.token) throw new Error("Pair your account to view media.");
    const target = new URL(url),
      base = new URL(this.base);
    if (target.origin !== base.origin || !/^\/v1\/media\/[0-9a-f-]{36}(\/preview)?$/.test(target.pathname))
      throw new Error("Invalid media reference.");
    const currentBase = this.base;
    const token = this.token,
      generation = this.sessionGeneration;
    const response = await this.transport(currentBase, target.pathname, "GET", undefined, token, true);
    if (
      response.status >= 400 ||
      currentBase !== this.base ||
      token !== this.token ||
      generation !== this.sessionGeneration
    )
      throw new Error("The media could not be loaded.");
    const bytes = Uint8Array.from(atob(response.body), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: response.mime });
  }
  async publicMedia(url: string) {
    return this.downloadMedia(url, true);
  }
  clearBlobs() {
    this.blobs.clear();
    this.blobContext = undefined;
  }
  async capabilities() {
    try {
      const value = await this.request<import("./studio-model.js").Capabilities>("/v2/capabilities");
      this.studioV2 = value.version === 2 && value.enabled === true;
      this.musicPrioritySupported = this.studioV2 && value.features?.musicPriority === true;
      return this.studioV2 ? value : null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        this.studioV2 = false;
        this.musicPrioritySupported = false;
        return null;
      }
      throw error;
    }
  }
  workspace() {
    return this.request<import("./studio-model.js").WorkspaceState>("/v2/me/workspace");
  }
}
