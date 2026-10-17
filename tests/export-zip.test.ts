import { expect, test } from "vitest";
import { unzipSync } from "fflate";
import { accountZip } from "../packages/plugin/export-zip.js";
test("account archives preserve metadata/media bytes and reject escaping names", () => {
  const files = [
    { name: "account.json", data: new TextEncoder().encode('{"test":true}') },
    { name: "media/11111111-1111-4111-8111-111111111111.webp", data: new Uint8Array([1, 2, 3]) },
  ];
  const result = unzipSync(accountZip(files));
  for (const file of files) expect(result[file.name]).toEqual(file.data);
  expect(() => accountZip([{ name: "../private", data: new Uint8Array() }])).toThrow();
});
