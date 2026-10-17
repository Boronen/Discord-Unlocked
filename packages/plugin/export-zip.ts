/** A small ZIP STORE writer. Account exports are capped by the server's 100 MiB quota. */
export function accountZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    total = 0;
  const encode = new TextEncoder();
  for (const file of files) {
    if (!/^(account\.json|media\/[0-9a-f-]{36}\.(webp|ogg))$/.test(file.name))
      throw new Error("Invalid export file name.");
    total += file.data.length;
    if (total > 102 * 1024 * 1024) throw new Error("Account export exceeds its size limit.");
    const name = encode.encode(file.name);
    let crc = 0xffffffff;
    for (const byte of file.data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, file.data.length, true);
    h.setUint32(22, file.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const directory = new Uint8Array(46 + name.length),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, file.data.length, true);
    d.setUint32(24, file.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    directory.set(name, 46);
    parts.push(header, file.data);
    central.push(directory);
    offset += header.length + file.data.length;
  }
  const size = central.reduce((n, part) => n + part.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of [...parts, ...central, end]) {
    output.set(part, at);
    at += part.length;
  }
  return output;
}
