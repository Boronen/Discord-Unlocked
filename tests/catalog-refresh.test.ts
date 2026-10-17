import { expect, test, vi } from "vitest";
import { refreshShopCatalog, SHOP_TABS } from "../packages/plugin/catalog-refresh.js";

const product = (id: string) => ({ skuId: id, name: id, items: [{ type: 0, asset: `a_${id}` }] });

test("keeps cached items even when failed requests clear Discord's stores", async () => {
  let products = [product("cached")];
  const fetchTab = vi.fn(async (_tab: string) => {
    products = [];
  });
  const result = await refreshShopCatalog({
    snapshot: () => products,
    fetchTab,
    errorForTab: () => ({ status: 503 }),
  });
  expect(result.items.map((item) => item.id)).toEqual(["cached"]);
  expect(result.warning).toContain("HTTP 503");
  expect(fetchTab.mock.calls.map((call) => call[0])).toEqual([...SHOP_TABS]);
});

test("merges successful tabs and imports them when one section fails", async () => {
  let products: unknown[] = [];
  const result = await refreshShopCatalog({
    snapshot: () => products,
    fetchTab: async (tab) => {
      products = tab === "profile-effects" ? [] : [product(tab.replaceAll("-", "_"))];
    },
    errorForTab: (tab) => (tab === "profile-effects" ? { status: 404 } : null),
  });
  expect(result.items).toHaveLength(4);
  expect(result.warning).toContain("profile-effects: HTTP 404");
  expect(result.warning).toContain("Partial refresh");
});

test("does not let an unrelated legacy category error override a successful modern shop refresh", async () => {
  const source = {
    snapshot: () => [product("unowned")],
    fetchTab: async () => {},
    errorForTab: () => null,
    error: { status: 400 },
  };
  const result = await refreshShopCatalog(source);
  expect(result.items).toHaveLength(1);
  expect(result.warning).toBeNull();
});

test("reports the HTTP status when no usable items could be loaded", async () => {
  await expect(
    refreshShopCatalog({
      snapshot: () => [],
      fetchTab: async () => {},
      errorForTab: () => ({ status: 403 }),
    }),
  ).rejects.toThrow("catalog: HTTP 403");
});

test("keeps usable cache during thrown request failures without exposing request details", async () => {
  const result = await refreshShopCatalog({
    snapshot: () => [product("cached")],
    fetchTab: async () => {
      throw new Error("private request detail");
    },
    errorForTab: () => null,
  });
  expect(result.items).toHaveLength(1);
  expect(result.warning).toContain("unavailable");
  expect(result.warning).not.toContain("private request detail");
});

test("offers an actionable empty result when the shop has no supported media", async () => {
  await expect(
    refreshShopCatalog({ snapshot: () => [], fetchTab: async () => {}, errorForTab: () => null }),
  ).rejects.toThrow("Open the Discord Shop");
});
