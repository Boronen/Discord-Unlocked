// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PrivacyPanel } from "../packages/plugin/PrivacyPanel.js";
import { StudioClient } from "../packages/plugin/client.js";
import { privacyNotice } from "../packages/server/privacy-notice.js";

afterEach(cleanup);
test("privacy is lazy, public and exposes incomplete configuration before pairing", async () => {
  let calls = 0;
  const api = new StudioClient("https://example.com", async (_base, _path, _method, _body, token) => {
    calls++;
    expect(token).toBeUndefined();
    return { status: 200, body: JSON.stringify(privacyNotice()) };
  });
  render(<PrivacyPanel api={api} />);
  expect(calls).toBe(0);
  const details = screen.getByText("Privacy notice · read before pairing").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  expect(await screen.findByText(/operator has not completed/)).toBeTruthy();
  expect(screen.getByText("Export and deletion")).toBeTruthy();
  expect(calls).toBe(1);
});
test("older/unavailable API shows a retry without requiring pairing", async () => {
  let attempt = 0;
  const api = new StudioClient("https://example.com", async () =>
    ++attempt === 1 ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify(privacyNotice()) },
  );
  render(<PrivacyPanel api={api} />);
  const details = screen.getByText("Privacy notice · read before pairing").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Export and deletion")).toBeTruthy();
});
