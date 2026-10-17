export function pickerPageLayout(width: number, height: number, nameplate = false) {
  const columns = Math.max(1, Math.min(4, Math.floor((width + 12) / 140)));
  const rows = Math.max(1, Math.floor((height + 12) / (nameplate ? 150 : 198)));
  return { columns, capacity: Math.min(12, columns * rows) };
}
