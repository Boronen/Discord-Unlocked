import type { CatalogItem } from "./model.js";
export function values(value: any): any[] {
  return value instanceof Map
    ? [...value.values()]
    : Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.values(value)
        : [];
}
function cdn(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
function bounded(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
/** Walk categories, bundles and variant groups without filtering by ownership. */
function productTree(products: any[]): any[] {
  const seen = new WeakSet<object>(),
    result: any[] = [];
  function walk(product: any) {
    if (!product || typeof product !== "object" || seen.has(product)) return;
    seen.add(product);
    result.push(product);
    for (const key of [
      "products",
      "variants",
      "productVariants",
      "bundledProducts",
      "categories",
      "collections",
    ])
      for (const child of values(product[key])) walk(child);
  }
  products.forEach(walk);
  return result;
}
/** Normalizes assets supplied to the Discord client; no entitlement calls. */
export function normalizeCatalog(products: any[], effects: any[]): CatalogItem[] {
  const result = new Map<string, CatalogItem>();
  const allEffects = [...effects];
  for (const product of productTree(products)) {
    for (const item of values(product.items ?? [product])) {
      const data = item.data ?? item,
        asset = data.asset;
      const type = item.type ?? data.type;
      if (type === 2 && typeof asset === "string" && /^nameplates\/(?:[a-zA-Z0-9_-]+\/){1,6}$/.test(asset)) {
        const id = String(
          item.skuId ?? item.sku_id ?? product.skuId ?? product.sku_id ?? item.id ?? product.id ?? "",
        );
        if (/^[a-zA-Z0-9_-]{1,100}$/.test(id))
          result.set(id, {
            id,
            kind: "nameplate",
            name: String(product.name ?? item.name ?? "Discord nameplate").slice(0, 150),
            imageUrl: `https://cdn.discordapp.com/assets/collectibles/${asset}asset.webm`,
            staticUrl: `https://cdn.discordapp.com/assets/collectibles/${asset}static.png`,
            discordAsset: asset,
            layers: [],
          });
        continue;
      }
      if (data.effects || data.thumbnailPreviewSrc || data.reducedMotionSrc) {
        allEffects.push({
          ...data,
          id: product.skuId ?? product.sku_id ?? data.skuId ?? data.id,
          name: product.name ?? data.title,
          config: data,
        });
      }
      if ((type != null && type !== 0) || typeof asset !== "string" || !/^[a-zA-Z0-9_]+$/.test(asset))
        continue;
      const id = String(
        item.skuId ?? item.sku_id ?? product.skuId ?? product.sku_id ?? item.id ?? product.id ?? "",
      );
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) continue;
      const imageUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png`;
      result.set(id, {
        id,
        kind: "decoration",
        name: String(product.name ?? item.name ?? "Discord decoration").slice(0, 150),
        imageUrl,
        staticUrl: `${imageUrl}?passthrough=false`,
        discordAsset: asset,
        layers: [],
      });
    }
  }
  for (const effect of allEffects) {
    const config = effect.config ?? effect,
      id = String(effect.id ?? effect.skuId ?? config.id ?? "");
    const imageUrl =
      config.thumbnailPreviewSrc ??
      config.thumbnail_preview_src ??
      config.reducedMotionSrc ??
      config.effects?.[0]?.src;
    const staticUrl =
      config.staticFrameSrc ?? config.reducedMotionSrc ?? config.reduced_motion_src ?? imageUrl;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !cdn(imageUrl) || !cdn(staticUrl)) continue;
    const layers = values(config.effects)
      .filter((layer) => cdn(layer.src))
      .slice(0, 12)
      .map((layer) => ({
        src: layer.src,
        width: Math.round(bounded(layer.width, 450, 1, 4096)),
        height: Math.round(bounded(layer.height, 880, 1, 4096)),
        start: bounded(layer.start, 0, 0, 60000),
        duration: bounded(layer.duration, 3000, 1, 60000),
        loop: Boolean(layer.loop),
        loopDelay: bounded(layer.loopDelay, 0, 0, 60000),
        x: bounded(layer.position?.x, 0, -4096, 4096),
        y: bounded(layer.position?.y, 0, -4096, 4096),
        zIndex: Math.round(bounded(layer.zIndex, 0, 0, 10)),
      }));
    result.set(id, {
      id,
      kind: "effect",
      name: String(effect.name ?? config.title ?? "Discord profile effect").slice(0, 150),
      imageUrl,
      staticUrl,
      discordAsset: null,
      layers,
    });
  }
  return [...result.values()];
}
