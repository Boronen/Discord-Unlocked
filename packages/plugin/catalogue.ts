import { findStoreLazy, mapMangledModuleLazy, filters } from "@webpack";
import { values } from "./catalog-model.js";
import { refreshShopCatalog, SHOP_TABS } from "./catalog-refresh.js";
export { normalizeCatalog } from "./catalog-model.js";
const Products = findStoreLazy("CollectiblesCategoryStore") as any;
const Homes = findStoreLazy("CollectiblesShopHomesStore") as any;
const Shop = mapMangledModuleLazy('"COLLECTIBLES_SHOP_HOME_FETCH"', {
  fetchHome: filters.byCode('"COLLECTIBLES_SHOP_HOME_FETCH"'),
}) as { fetchHome: (tab: string, options: Record<string, unknown>) => Promise<void> };
export let lastShopRefresh = "Not refreshed yet";
export async function readClientCatalog() {
  try {
    const result = await refreshShopCatalog({
      snapshot: () => {
        const products: unknown[] = [];
        try {
          products.push(
            ...values(Products.products),
            ...values(Products.productsWithVariantsAsGroup),
            ...values(Products.categories),
          );
        } catch {}
        for (const tab of SHOP_TABS) {
          try {
            products.push(...values(Homes.getCategories(tab)));
          } catch {}
        }
        return products;
      },
      // These use the same current endpoint/tabs as Discord's native Shop.
      fetchTab: (tab) => Shop.fetchHome(tab, { includeBundles: true, variantsReturnStyle: 2 }),
      errorForTab: (tab) => Homes.getFetchShopHomeError(tab),
    });
    lastShopRefresh = result.warning ?? `${result.items.length} supported items loaded`;
    return result;
  } catch (error) {
    lastShopRefresh = error instanceof Error ? error.message : "Shop import failed";
    throw error;
  }
}
