import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, appendFile, stat, open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Writable, Readable } from "node:stream";

export async function readKey(path) {
  const key = Buffer.from((await readFile(path, "utf8")).trim(), "base64");
  if (key.length !== 32) throw new Error("The backup key must contain 32 random bytes in base64.");
  return key;
}
export async function encrypt(source, path, key) {
  const iv = randomBytes(12),
    header = Buffer.concat([Buffer.from("PSB2"), iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  await writeFile(path, header, { flag: "wx", mode: 0o600 });
  await pipeline(source, cipher, createWriteStream(path, { flags: "a", mode: 0o600 }));
  await appendFile(path, cipher.getAuthTag());
  return checksum(path);
}
export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function decrypt(path, destination, key) {
  const size = (await stat(path)).size,
    handle = await open(path, "r");
  const header = Buffer.alloc(16),
    tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 16, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (size < 32 || header.toString("ascii", 0, 4) !== "PSB2") throw new Error("Invalid encrypted backup.");
  const cipher = createDecipheriv("aes-256-gcm", key, header.subarray(4));
  cipher.setAAD(header);
  cipher.setAuthTag(tag);
  await pipeline(
    size === 32 ? Readable.from([]) : createReadStream(path, { start: 16, end: size - 17 }),
    cipher,
    destination,
  );
}
export const discard = () =>
  new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
export function sealManifest(manifest, key) {
  const subkey = createHmac("sha256", key).update("Profile Studio backup manifest v2").digest();
  const authentication = createHmac("sha256", subkey).update(JSON.stringify(manifest)).digest("hex");
  return { ...manifest, authentication };
}
export function verifyManifest(manifest, key) {
  const { authentication, ...unsigned } = manifest;
  if (typeof authentication !== "string" || !/^[a-f0-9]{64}$/.test(authentication))
    throw new Error(
      "Unauthenticated backup manifest. Create a fresh verified backup before automated restoration.",
    );
  const expected = sealManifest(unsigned, key).authentication;
  if (!timingSafeEqual(Buffer.from(authentication, "hex"), Buffer.from(expected, "hex")))
    throw new Error("Backup manifest authentication failed.");
  return unsigned;
}
