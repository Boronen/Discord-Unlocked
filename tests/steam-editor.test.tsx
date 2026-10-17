// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { BlockEditor } from "../packages/plugin/studio-editor-panels.js";
import { configureSteamGames, type SteamGame } from "../packages/plugin/steam-games.js";
import { normalizeStudio, resolveScene, type SceneConfig } from "../packages/plugin/studio-model.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { profileV2Schema } from "../packages/shared/studio-schema.js";
afterEach(() => {
  cleanup();
  configureSteamGames();
});
test("game selection preserves intervening edits and saves an existing-schema moderated link", async () => {
  let finish!: (value: SteamGame) => void;
  configureSteamGames(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const initial = resolveScene(normalizeStudio(DEFAULT_CONFIG), "full");
  initial.blocks = [
    { id: "game", kind: "games", title: "Favorite game", text: "", links: [], visible: true },
  ];
  let latest: SceneConfig = initial;
  function Harness() {
    const [scene, setScene] = React.useState(initial);
    latest = scene;
    return <BlockEditor scene={scene} onChange={setScene} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Steam game link or App ID"), { target: { value: "440" } });
  fireEvent.click(screen.getByRole("button", { name: "Select Steam game" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.change(screen.getByLabelText("Panel title"), { target: { value: "My favorites" } });
  finish({ appId: "440", name: "Example", url: "https://store.steampowered.com/app/440/", images: [] });
  await screen.findByText("Selected: Example");
  expect(latest.blocks[0]!.title).toBe("My favorites");
  expect(latest.blocks[0]!.links).toEqual([
    { label: "Example", url: "https://store.steampowered.com/app/440/" },
  ]);
  const profile = normalizeStudio(DEFAULT_CONFIG);
  profile.studio.base = latest;
  expect(profileV2Schema.safeParse(profile).success).toBe(true);
});
