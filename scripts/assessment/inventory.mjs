// Read-only source inventory. Private measurements stay outside release packages.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const output = resolve("diagnostics/refactor-stage0");
// The application uses the native TS 7 compiler. Use the pinned Vencord TS 6
// parser for this read-only tool rather than adding a second runtime dependency.
const ts = createRequire(import.meta.url)(
  resolve(".vendor/Vencord/node_modules/typescript/lib/typescript.js"),
);
await mkdir(output, { recursive: true });
const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(Boolean);
const source = [],
  routes = [],
  imports = [],
  scheduling = [];
for (const path of files) {
  if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
  const text = await readFile(path, "utf8");
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  source.push({ path, bytes: Buffer.byteLength(text), lines: text.split(/\r?\n/).length });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      imports.push({ from: path, specifier, typeOnly: !!node.importClause?.isTypeOnly });
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression.getText(tree);
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if (
        /^app\.(get|post|put|delete|patch|options)$/.test(call) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        routes.push({
          method: call.split(".")[1].toUpperCase(),
          path: node.arguments[0].text,
          file: path,
          line,
        });
      if (/^(setInterval|setTimeout|requestAnimationFrame)$/.test(call))
        scheduling.push({ file: path, line, call });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const dependencies = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, v]) => ({
    path,
    version: v.version,
    license: v.license ?? "not declared in lockfile",
    development: !!v.dev,
  }));
const artifacts = [];
for (const path of [
  "dist/windows/ProfileStudio-Windows.zip",
  "dist/release/profile-studio-source.zip",
  ".vendor/Vencord/dist/renderer.js",
  ".vendor/Vencord/dist/patcher.js",
]) {
  const bytes = await readFile(path).catch(() => null);
  if (bytes)
    artifacts.push({
      path,
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
}
const docs = (
  await Promise.all(files.filter((p) => /^docs\/.*\.md$/.test(p)).map((p) => readFile(p, "utf8")))
).join("\n");
const covered = routes.map((r) => ({ ...r, pathMentionedInDocs: docs.includes(r.path) }));
const result = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  trackedFiles: files.length,
  source: source.sort((a, b) => b.lines - a.lines),
  serverImportsPlugin: imports.filter(
    (i) => /^packages\/(server|shared|bot)\//.test(i.from) && /\/plugin\//.test(i.specifier),
  ),
  imports,
  routes: covered,
  scheduling,
  dependencies,
  directDependencies: { production: pkg.dependencies, development: pkg.devDependencies },
  artifacts,
  notes: [
    "Path mention is a documentation discovery heuristic, not contract coverage.",
    "Static imports do not establish dead-code safety for native exports, dynamic patches, migration scripts or operator commands.",
  ],
};
await writeFile(resolve(output, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      trackedFiles: files.length,
      sourceFiles: source.length,
      apiRoutes: routes.length,
      routesMentioned: covered.filter((r) => r.pathMentionedInDocs).length,
      layerViolations: result.serverImportsPlugin.length,
      dependencies: dependencies.length,
      largest: result.source.slice(0, 5),
      artifacts,
    },
    null,
    2,
  ),
);
