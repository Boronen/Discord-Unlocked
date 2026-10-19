import { describe, expect, it } from "vitest";
import { protectedStorageAvailable } from "../packages/plugin/secret-storage.js";

describe("OS-backed secret storage", () => {
  it("refuses Linux basic_text, uninitialized/unknown backends and missing APIs even if encryption is advertised", () => {
    for (const backend of ["basic_text", "unknown", "", "future_backend"])
      expect(
        protectedStorageAvailable("linux", {
          isEncryptionAvailable: () => true,
          getSelectedStorageBackend: () => backend,
        }),
      ).toBe(false);
    expect(protectedStorageAvailable("linux", { isEncryptionAvailable: () => true })).toBe(false);
  });
  it("accepts known Linux secret stores only while encryption is available", () => {
    for (const backend of ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"])
      for (const available of [true, false])
        expect(
          protectedStorageAvailable("linux", {
            isEncryptionAvailable: () => available,
            getSelectedStorageBackend: () => backend,
          }),
        ).toBe(available);
  });
  it("retains Windows/macOS encryption availability and fails closed on storage errors", () => {
    for (const platform of ["win32", "darwin"])
      for (const available of [true, false])
        expect(protectedStorageAvailable(platform, { isEncryptionAvailable: () => available })).toBe(
          available,
        );
    expect(
      protectedStorageAvailable("linux", {
        isEncryptionAvailable: () => {
          throw new Error("locked");
        },
      }),
    ).toBe(false);
    expect(
      protectedStorageAvailable("linux", {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => {
          throw new Error("locked");
        },
      }),
    ).toBe(false);
  });
});
