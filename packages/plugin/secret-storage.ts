// SPDX-License-Identifier: GPL-3.0-or-later
interface SecretStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
}

/** Linux's basic_text fallback is not OS-backed secret protection. */
export function protectedStorageAvailable(platform: string, storage: SecretStorage): boolean {
  try {
    if (!storage.isEncryptionAvailable()) return false;
    if (platform !== "linux") return true;
    const backend = storage.getSelectedStorageBackend?.();
    return backend !== undefined && ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(backend);
  } catch {
    return false;
  }
}
