import { test, expect } from "vitest";
import { setup, ALICE, MOD, OWNER } from "./helpers.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";

test("nameplates require the correct enabled catalog kind and remain private until approval", async () => {
  const context = await setup();
  try {
    const { service } = context;
    const item = {
      id: "night-flight",
      kind: "nameplate",
      name: "Night Flight",
      imageUrl: "https://cdn.discordapp.com/assets/collectibles/nameplates/test/asset.webm",
      staticUrl: "https://cdn.discordapp.com/assets/collectibles/nameplates/test/static.png",
      discordAsset: "nameplates/test/",
      layers: [],
    };
    const config = { ...DEFAULT_CONFIG, nameplate: item.id };
    await expect(service.saveDraft(ALICE, config, 0)).rejects.toMatchObject({ code: "INVALID_CATALOG" });
    await service.upsertCatalogBatch(OWNER, [{ ...item, kind: "decoration" }]);
    await expect(service.saveDraft(ALICE, config, 0)).rejects.toMatchObject({ code: "INVALID_CATALOG" });
    await service.upsertCatalogBatch(OWNER, [item]);
    const draft = await service.saveDraft(ALICE, config, 0);
    const revision = await service.submit(ALICE, draft.version);
    expect((await service.publicProfiles([ALICE]))[ALICE]).toBeNull();
    await service.decide(MOD, revision.id, "approve");
    expect((await service.publicProfiles([ALICE]))[ALICE]?.config.nameplate).toBe(item.id);
  } finally {
    await context.raw.close();
  }
});
