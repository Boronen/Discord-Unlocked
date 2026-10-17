import { expect, test } from "vitest";
import { setup, ALICE, MOD, OWNER } from "./helpers.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { TINT_PALETTE, tintMatrix } from "../packages/plugin/tint.js";
import { profileConfigSchema } from "../packages/shared/schema.js";

test("palette has 28 unique named colors; tint matrix preserves alpha and identity at zero", () => {
  expect(new Set(TINT_PALETTE.map((item) => item.color)).size).toBe(28);
  expect(tintMatrix({ color: "#ff0000", intensity: 0 })).toBe("1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0");
  const matrix = tintMatrix({ color: "#ff0000", intensity: 1 }).split(" ").map(Number);
  expect(matrix.slice(-5)).toEqual([0, 0, 0, 1, 0]);
  expect(matrix.slice(5, 15).every((value) => value === 0)).toBe(true);
  expect(
    profileConfigSchema.safeParse({
      ...DEFAULT_CONFIG,
      albumBackground: { enabled: true, opacity: 2, blur: 99 },
    }).success,
  ).toBe(false);
});
test("supporter checks cannot be bypassed by direct saves, submit, or moderator approval; approved colors survive role loss", async () => {
  const context = await setup();
  const supporters = new Set<string>();
  context.permissions.canUseCustomTint = async (id) => supporters.has(id);
  const { service, db } = context;
  const custom = { ...DEFAULT_CONFIG, effectTint: { color: "#123456", intensity: 0.75 } };
  try {
    expect((await service.editor(ALICE)).canUseCustomTint).toBe(false);
    expect((await service.editor(OWNER)).canUseCustomTint).toBe(true);
    expect((await service.editor(MOD)).canUseCustomTint).toBe(false);
    await expect(service.saveDraft(ALICE, custom, 0)).rejects.toMatchObject({ code: "SUPPORTER_REQUIRED" });
    const base = await service.saveDraft(
      ALICE,
      { ...custom, effectTint: { color: TINT_PALETTE[0]!.color, intensity: 0.5 } },
      0,
    );
    supporters.add(ALICE);
    const saved = await service.saveDraft(ALICE, custom, base.version);
    supporters.delete(ALICE);
    await expect(service.submit(ALICE, saved.version)).rejects.toMatchObject({ code: "SUPPORTER_REQUIRED" });
    supporters.add(ALICE);
    const pending = await service.submit(ALICE, saved.version);
    supporters.delete(ALICE);
    await expect(service.decide(MOD, pending.id, "approve")).rejects.toMatchObject({
      code: "SUPPORTER_REQUIRED",
    });
    supporters.add(ALICE);
    await service.decide(MOD, pending.id, "approve");
    supporters.delete(ALICE);
    const retained = await service.saveDraft(
      ALICE,
      { ...custom, colors: ["#112233", "#445566"] },
      saved.version,
    );
    expect(retained.version).toBeGreaterThan(saved.version);
    await expect(
      service.saveDraft(
        ALICE,
        { ...custom, effectTint: { color: "#654321", intensity: 0.75 } },
        retained.version,
      ),
    ).rejects.toMatchObject({ code: "SUPPORTER_REQUIRED" });
    await expect(
      service.saveDraft(
        ALICE,
        { ...custom, effectTint: null, decorationTint: custom.effectTint },
        retained.version,
      ),
    ).rejects.toMatchObject({ code: "SUPPORTER_REQUIRED" });
    expect((await service.publicProfiles([ALICE]))[ALICE]?.config.effectTint?.color).toBe("#123456");
    expect((await db.query("SELECT status FROM revisions WHERE id=$1", [pending.id]))[0]?.status).toBe(
      "approved",
    );
  } finally {
    await context.raw.close();
  }
});
