// @vitest-environment jsdom
import { expect, test } from "vitest";
import { Notice } from "../packages/plugin/Editor.js";
import { Notice as CanonicalNotice } from "../packages/plugin/studio-notice.js";
import { ConfirmAction } from "../packages/plugin/StudioWorkspace.js";
import { ConfirmAction as CanonicalConfirm, StudioDialog } from "../packages/plugin/studio-dialogs.js";
import { StudioDialog as LegacyDialog } from "../packages/plugin/studio-community.js";

test("editor extraction preserves public component identities", () => {
  expect(Notice).toBe(CanonicalNotice);
  expect(ConfirmAction).toBe(CanonicalConfirm);
  expect(LegacyDialog).toBe(StudioDialog);
});
