import { expect, test } from "vitest";
import { normalizeCatalog } from "../packages/plugin/catalog-model.js";
import { catalogSchema } from "../packages/shared/schema.js";
test("reads marketplace profile effects directly from modern category products", () => {
  const items = normalizeCatalog(
    [
      {
        skuId: "shop-effect",
        name: "Sakura",
        items: [
          {
            id: "effect-data",
            type: 1,
            thumbnailPreviewSrc: "https://cdn.discordapp.com/effects/thumb.png",
            reducedMotionSrc: "https://cdn.discordapp.com/effects/static.png",
            effects: [
              {
                src: "https://cdn.discordapp.com/effects/animated.png",
                duration: 2500,
                loop: true,
                loopDelay: 500,
                width: 450,
                height: 880,
                position: { x: 0, y: 0 },
              },
            ],
          },
        ],
      },
    ],
    [],
  );
  expect(items).toHaveLength(1);
  expect(items[0]?.kind).toBe("effect");
  expect(items[0]?.id).toBe("shop-effect");
  expect(items[0]?.layers[0]?.loop).toBe(true);
  expect(catalogSchema.safeParse(items[0]).success).toBe(true);
});
test("does not admit remote hosts or executable effect sources", () => {
  expect(
    normalizeCatalog(
      [],
      [
        {
          id: "bad",
          thumbnailPreviewSrc: "javascript:alert(1)",
          reducedMotionSrc: "https://evil.example/x.png",
        },
      ],
    ),
  ).toEqual([]);
});

test("includes unowned products, bundle children and all variants without admitting nameplates", () => {
  const decoration = (id: string) => ({
    skuId: id,
    name: id,
    isPurchased: false,
    items: [{ type: 0, asset: `a_${id}` }],
  });
  const category: any = {
    products: [
      decoration("unowned"),
      { variants: [decoration("variant1"), decoration("variant2")] },
      { bundledProducts: [decoration("bundlechild")] },
      { skuId: "nameplate", items: [{ type: 2, asset: "not_a_decoration" }] },
    ],
  };
  category.collections = [category];
  const items = normalizeCatalog([category], []);
  expect(items.map((item) => item.id).sort()).toEqual(["bundlechild", "unowned", "variant1", "variant2"]);
  items.forEach((item) => expect(catalogSchema.safeParse(item).success).toBe(true));
});

test("imports nameplate WebM and static PNG from bounded Discord collectible paths", () => {
  const [item] = normalizeCatalog(
    [
      {
        skuId: "night-flight",
        name: "Night Flight",
        items: [{ type: 2, data: { asset: "nameplates/nameplates/twilight/" } }],
      },
    ],
    [],
  );
  expect(item?.kind).toBe("nameplate");
  expect(item?.imageUrl).toBe(
    "https://cdn.discordapp.com/assets/collectibles/nameplates/nameplates/twilight/asset.webm",
  );
  expect(item?.staticUrl).toMatch(/\/static\.png$/);
  expect(catalogSchema.safeParse(item).success).toBe(true);
  expect(
    normalizeCatalog([{ skuId: "bad", items: [{ type: 2, asset: "nameplates/../../evil/" }] }], []),
  ).toEqual([]);
});
