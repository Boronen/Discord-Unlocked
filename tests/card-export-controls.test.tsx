// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CardExportControls } from "../packages/plugin/CardExportControls.js";
vi.mock("../packages/plugin/profile-export.js", () => ({
  profileSvg: vi.fn(async () => ({ svg: "<svg/>", width: 900, height: 900 })),
}));
vi.mock("../packages/plugin/gif-recording.js", () => ({ recordProfileGif: vi.fn() }));
import { recordProfileGif } from "../packages/plugin/gif-recording.js";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("offers PNG and GIF, exports a still and reports native cancellation", async () => {
  const png = vi.fn(async () => true);
  const gif = { begin: vi.fn(), frame: vi.fn(), finish: vi.fn(), cancel: vi.fn() };
  vi.mocked(recordProfileGif).mockResolvedValue(false);
  render(
    <CardExportControls getCard={() => document.body} artworkLoader={async () => ""} png={png} gif={gif} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
  await screen.findByText("Profile card exported as PNG.");
  expect(png).toHaveBeenCalledWith("<svg/>", 900, 900);
  fireEvent.change(screen.getByLabelText("Card export"), { target: { value: "gif" } });
  fireEvent.click(screen.getByRole("button", { name: "Export GIF" }));
  await screen.findByText("Export cancelled.");
  expect(recordProfileGif).toHaveBeenCalledOnce();
});
it("prevents duplicate exports and aborts recording on Cancel and unmount", async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(recordProfileGif).mockImplementation(async (_card, _art, _gif, value) => {
    signal = value;
    return new Promise((resolve) => value.addEventListener("abort", () => resolve(false), { once: true }));
  });
  const gif = { begin: vi.fn(), frame: vi.fn(), finish: vi.fn(), cancel: vi.fn() };
  const view = render(
    <CardExportControls getCard={() => document.body} artworkLoader={async () => ""} gif={gif} />,
  );
  fireEvent.change(screen.getByLabelText("Card export"), { target: { value: "gif" } });
  fireEvent.click(screen.getByRole("button", { name: "Export GIF" }));
  expect((screen.getByRole("button", { name: "Export GIF" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
  expect(signal?.aborted).toBe(true);
  await screen.findByText("Export cancelled.");
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Export GIF" }) as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Export GIF" }));
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
