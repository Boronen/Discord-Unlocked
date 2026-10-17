import { execFileSync, spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
// Public GnuTLS 3.7.9 self-test vectors, verified against the official source:
// https://gitlab.com/gnutls/gnutls/-/blob/3.7.9/lib/crypto-selftests-pk.c
// Applied only to the actual libgnutls shared-library member, never to application files.
const gnutlsTestHashes = new Set([
  "f4b1de2f94f1df2d588ff6c18290e0f7f5091267b9ef0da8433c622bad3d127a",
  "80ec06e06b06635bcad5c71b0e9e7a3516c02133c682a2369b09599addb8d7f3",
  "d653005e4d23cf91e3572fe8148ab6db2e474924d9711838521d3ba352b193f5",
  "b8369cc647a1e1e8f8e420b6b8580c36223f89b0f8e70281732d028aebf15fac",
  "3de5d1d9ca9af8e24d29bab925c3d500c2cdd11a06c4a2c6a6b336e73bb3ad56",
  "c72070fc1ffb2df729650b949157c85ec03d8ec9743ba7956c03e21d385bce4e",
]);
const rules = [
  [
    "private key",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----(?:\s|\\n|\\r)+[A-Za-z0-9+/=\\\r\n]{32,}/,
  ],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})/],
  ["cloud access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{20,}/],
];
export const forbidden = (path) =>
  /(?:^|\/)(?:secrets|data|backups|exports|diagnostics|node_modules|\.vendor|\.git)(?:\/|$)/i.test(path) ||
  (/(?:^|\/)\.env(?:\..*)?$/i.test(path) && !path.endsWith(".env.example")) ||
  /\.(?:reg|pem|key|p8|p12|pfx|jks|keystore|dump|dmp|bak|backup|bkp|psb|har|heapsnapshot|sqlite3?|db)$/i.test(
    path,
  ) ||
  (/\.sql$/i.test(path) && !/^(?:migrations|deploy)\//.test(path));
export function scanBuffer(buffer, known = [], publicTestLibrary = false) {
  const text = Buffer.from(buffer).toString("utf8"),
    issues = [];
  const keyText = publicTestLibrary
    ? text.replace(
        /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]+-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
        (key) =>
          gnutlsTestHashes.has(
            createHash("sha256")
              .update(key.trim() + "\n")
              .digest("hex"),
          )
            ? ""
            : key,
      )
    : text;
  for (const [name, pattern] of rules)
    if (pattern.test(name === "private key" ? keyText : text)) issues.push(name);
  const tokens = text.match(/[A-Za-z0-9_-]{23,32}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{24,110}/g) ?? [];
  if (
    tokens.some((token) =>
      /^\d{17,20}$/.test(Buffer.from(token.split(".")[0], "base64url").toString("ascii")),
    ) ||
    /mfa\.[A-Za-z0-9_-]{60,100}/.test(text)
  )
    issues.push("Discord token");
  for (const secret of known)
    if (secret.length >= 16 && text.includes(secret)) {
      issues.push("local secret value");
      break;
    }
  return issues;
}
export function scanZip(buffer, known = []) {
  const entries = unzipSync(new Uint8Array(buffer)),
    findings = [];
  for (const [path, data] of Object.entries(entries)) {
    if (forbidden(path) || path.startsWith("/") || path.split("/").includes(".."))
      findings.push({ path, rule: "forbidden packaged path" });
    for (const rule of scanBuffer(data, known)) findings.push({ path, rule });
  }
  return findings;
}
async function localSecrets() {
  const values = [];
  for (const name of await readdir("secrets").catch(() => [])) {
    if (!/\.(env|key|json)$/.test(name)) continue;
    const text = await readFile(`secrets/${name}`, "utf8");
    if (name.endsWith(".key")) values.push(text.trim());
    if (name === "database-passwords.json") values.push(...Object.values(JSON.parse(text)));
    for (const line of text.split(/\r?\n/))
      if (/^[A-Z_]*(TOKEN|PASSWORD|SECRET|PRIVATE_KEY)=/.test(line))
        values.push(line.slice(line.indexOf("=") + 1).trim());
  }
  return values.filter((v) => typeof v === "string" && v.length >= 16 && !/replace|example/i.test(v));
}
async function scanStream(source, known) {
  const findings = new Set();
  let tail = "";
  for await (const chunk of source) {
    const text = tail + Buffer.from(chunk).toString("latin1");
    for (const rule of scanBuffer(Buffer.from(text, "latin1"), known)) findings.add(rule);
    tail = text.slice(-4096);
  }
  return [...findings];
}
async function walkTar(source, visit) {
  const iterator = source[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  async function take(size) {
    while (buffer.length < size) {
      const part = await iterator.next();
      if (part.done) throw new Error("Truncated image archive.");
      buffer = Buffer.concat([buffer, part.value]);
    }
    const value = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    return value;
  }
  while (true) {
    const header = await take(512);
    if (header.every((v) => v === 0)) break;
    const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
    const name = (prefix ? prefix + "/" : "") + header.toString("utf8", 0, 100).replace(/\0.*$/, ""),
      size = parseInt(header.toString("ascii", 124, 136).replace(/\0.*$/, "").trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid image archive member.");
    if (size) {
      const first = await take(Math.min(size, 65536));
      async function* content() {
        yield first;
        for (let left = size - first.length; left > 0;) {
          const n = Math.min(left, 65536);
          yield await take(n);
          left -= n;
        }
      }
      await visit(name, Readable.from(content()), first, size);
    }
    if (size % 512) await take(512 - (size % 512));
  }
  // Consume terminal padding so parent streams can finish without backpressure.
  for await (const _chunk of { [Symbol.asyncIterator]: () => iterator }) {
  }
}
/** Scan every saved OCI/Docker image member, including each decompressed file in every layer. */
async function scanImage(image, known) {
  if (!/^[a-zA-Z0-9._/:@-]+$/.test(image)) throw new Error("Invalid local image name.");
  const child = spawn("docker", ["image", "save", image], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error("Image export failed."))));
  });
  const findings = [];
  async function inspect(name, stream, _first, size) {
    if (
      name.startsWith("app/") &&
      (/(?:^|\/)(?:secrets|backups|exports|diagnostics)(?:\/|$)/.test(name) ||
        (/(?:^|\/)\.env(?:\..*)?$/.test(name) && !name.endsWith(".env.example")))
    )
      findings.push({ path: `image:${image}/${name}`, rule: "forbidden image path" });
    let issues;
    if (
      /^usr\/lib\/(?:x86_64-linux-gnu|aarch64-linux-gnu)\/libgnutls\.so\.30\.[0-9.]+$/.test(name) &&
      size < 32 * 1024 * 1024
    ) {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      issues = scanBuffer(Buffer.concat(chunks), known, true);
    } else issues = await scanStream(stream, known);
    for (const rule of issues) findings.push({ path: `image:${image}/${name}`, rule });
  }
  await walkTar(child.stdout, async (name, stream, first, size) => {
    if (first[0] === 0x28 && first[1] === 0xb5 && first[2] === 0x2f && first[3] === 0xfd)
      throw new Error(
        "Zstandard image layers require a supported decoder; scan stopped without a clean result.",
      );
    if (first[0] === 31 && first[1] === 139) await walkTar(stream.pipe(createGunzip()), inspect);
    else if (name.endsWith(".tar") || first.toString("ascii", 257, 262) === "ustar")
      await walkTar(stream, inspect);
    else await inspect(name, stream, first, size);
  });
  await completion;
  return findings;
}
export async function scanProject() {
  const known = await localSecrets(),
    findings = [];
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    maxBuffer: 16 * 1024 * 1024,
  })
    .toString()
    .split("\0")
    .filter(Boolean);
  for (const path of paths) {
    if (forbidden(path)) findings.push({ path, rule: "forbidden repository path" });
    const data = await readFile(path);
    for (const rule of scanBuffer(data, known)) findings.push({ path, rule });
  }
  const objects = execFileSync("git", ["rev-list", "--objects", "--all"], { maxBuffer: 32 * 1024 * 1024 })
    .toString()
    .split("\n")
    .filter(Boolean);
  const publishedObjects = new Set(
    execFileSync("git", ["rev-list", "--objects", "--branches", "--tags", "--remotes"], {
      maxBuffer: 32 * 1024 * 1024,
    })
      .toString()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" ")[0]),
  );
  for (const entry of objects) {
    const space = entry.indexOf(" ");
    if (space < 0) continue;
    const sha = entry.slice(0, space),
      path = entry.slice(space + 1);
    const type = execFileSync("git", ["cat-file", "-t", sha]).toString().trim();
    if (type !== "blob") continue;
    // App recovery snapshots are private tree refs, not commit history. Still scan their contents.
    if (forbidden(path) && publishedObjects.has(sha))
      findings.push({ path: `history:${path}`, rule: "forbidden historical path" });
    const data = execFileSync("git", ["cat-file", "blob", sha], { maxBuffer: 64 * 1024 * 1024 });
    for (const rule of scanBuffer(data, known)) findings.push({ path: `history:${path}`, rule });
  }
  for (const name of await readdir("dist/release").catch(() => []))
    if (name.endsWith(".zip"))
      findings.push(
        ...scanZip(await readFile(`dist/release/${name}`), known).map((v) => ({
          ...v,
          path: `${name}:${v.path}`,
        })),
      );
  const at = process.argv.indexOf("--image");
  if (at >= 0) findings.push(...(await scanImage(process.argv[at + 1], known)));
  if (findings.length) {
    for (const item of findings) console.error(`${item.rule}: ${item.path}`);
    throw new Error(`Security scan failed (${findings.length} findings); matched values are never printed.`);
  }
  console.log(
    `Secret scan passed: ${paths.length} working-tree files, ${objects.length} Git objects, release ZIPs${at >= 0 ? ", all image layers" : ""}.`,
  );
}
export async function scanDeploymentImage(image) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,200}$/.test(image ?? ""))
    throw new Error("Specify an explicit local image reference.");
  const findings = await scanImage(image, await localSecrets());
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.rule}: ${finding.path}`);
    throw new Error("Deployment image secret scan failed. Matched values are never printed.");
  }
  console.log("Deployment image secret scan passed for every supported image layer.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--image-only");
  if (at >= 0) await scanDeploymentImage(process.argv[at + 1]);
  else await scanProject();
}
