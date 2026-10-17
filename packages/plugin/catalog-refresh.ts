import { normalizeCatalog } from "./catalog-model.js";
import type { CatalogItem } from "./model.js";

// Tab names verified against the current Discord Shop client.
export const SHOP_TABS = [
  "catalog",
  "avatar-decorations",
  "profile-effects",
  "nameplates",
  "bundles",
] as const;
export interface CatalogRefreshResult {
  items: CatalogItem[];
  warning: string | null;
}
export interface ShopCatalogSource {
  snapshot(): unknown[];
  fetchTab(tab: string): Promise<void>;
  errorForTab(tab: string): unknown;
}
function httpStatus(error: unknown): string {
  const status = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? `HTTP ${status}` : "unavailable";
}
/** Preserve usable assets before a failed Discord action can clear its store. */
export async function refreshShopCatalog(source: ShopCatalogSource): Promise<CatalogRefreshResult> {
  const items = new Map<string, CatalogItem>();
  const failures: string[] = [];
  const capture = () => {
    for (const item of normalizeCatalog(source.snapshot(), [])) items.set(item.id, item);
  };
  capture();
  for (const tab of SHOP_TABS) {
    try {
      await source.fetchTab(tab);
      const error = source.errorForTab(tab);
      if (error) failures.push(`${tab}: ${httpStatus(error)}`);
    } catch (error) {
      // Error messages from Discord may contain request details. Only expose status.
      failures.push(`${tab}: ${httpStatus(error)}`);
    }
    capture();
  }
  if (!items.size)
    throw new Error(
      failures.length
        ? `Discord Shop could not load any supported items (${failures.join("; ")}). Open the Discord Shop, then retry the import.`
        : "No supported shop items are loaded. Open the Discord Shop or profile effects picker, then retry the import.",
    );
  return {
    items: [...items.values()],
    warning: failures.length
      ? `Partial refresh (${failures.join("; ")}). Available and previously loaded items were kept. Open the missing Shop sections and refresh again to load more.`
      : null,
  };
}
