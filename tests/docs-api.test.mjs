import test from "node:test";
import assert from "node:assert/strict";
import { assertCoverage, checkApiDocs } from "../scripts/docs-api.mjs";

test("every registered route and reviewed contract source matches generated documentation", async () => {
  assert.ok((await checkApiDocs()) >= 63);
});
test("coverage rejects missing routes, missing contract fields and undocumented stale routes", () => {
  const actual = [{ key: "GET /health" }];
  assert.throws(() => assertCoverage(actual, {}), /coverage differs/);
  assert.throws(() => assertCoverage(actual, { "GET /health": { access: "public" } }), /Missing request/);
  assert.throws(() => assertCoverage([], { "GET /removed": {} }), /coverage differs/);
});
