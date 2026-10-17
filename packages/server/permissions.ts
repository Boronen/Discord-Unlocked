import type { Config } from "./config.js";
import { AppError, invariant } from "./errors.js";
export interface Permissions {
  member(userId: string, fresh?: boolean): Promise<void>;
  moderator(userId: string): Promise<void>;
  isOwner(userId: string): boolean;
  canUseCustomTint?(userId: string, fresh?: boolean): Promise<boolean>;
}
export function discordPermissions(config: Config): Permissions {
  const cache = new Map<string, { roles: string[]; until: number }>();
  async function roles(userId: string, fresh = true): Promise<string[]> {
    invariant(config.BETA_ROLE_ID, 503, "BETA_CLOSED", "The beta is not open. Contact the operator.");
    const cached = cache.get(userId);
    if (!fresh && cached && cached.until > Date.now()) return cached.roles;
    let response: Response;
    try {
      response = await fetch(`https://discord.com/api/v10/guilds/${config.GUILD_ID}/members/${userId}`, {
        headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      cache.delete(userId);
      throw new AppError(503, "DISCORD_UNAVAILABLE", "Discord permissions could not be checked. Try again.");
    }
    if (response.status === 404) {
      cache.delete(userId);
      throw new AppError(403, "NOT_MEMBER", "Community membership and the beta role are required.");
    }
    if (!response.ok)
      throw new AppError(503, "DISCORD_UNAVAILABLE", "Discord permissions could not be checked. Try again.");
    cache.delete(userId);
    const value = (await response.json()) as { roles: string[] };
    invariant(
      Array.isArray(value.roles) && value.roles.includes(config.BETA_ROLE_ID),
      403,
      "BETA_ROLE_REQUIRED",
      "The community beta role is required.",
    );
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(userId, { roles: value.roles, until: Date.now() + 30_000 });
    return value.roles;
  }
  return {
    isOwner: (id) => id === config.OWNER_ID,
    async canUseCustomTint(id, fresh = true) {
      if (id === config.OWNER_ID) return true;
      if (!config.SUPPORTER_ROLE_ID) return false;
      return (await roles(id, fresh)).includes(config.SUPPORTER_ROLE_ID);
    },
    async member(id, fresh = true) {
      await roles(id, fresh);
    },
    async moderator(id) {
      const current = await roles(id, true);
      if (id === config.OWNER_ID) return;
      invariant(
        current.includes(config.MODERATOR_ROLE_ID),
        403,
        "MODERATOR_REQUIRED",
        "A moderator role is required.",
      );
    },
  };
}
