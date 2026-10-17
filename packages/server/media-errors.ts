// Compatibility for system-generated errors saved before the English UI release.
// User-entered moderation reasons are deliberately left untouched.
const legacy = new Map([
  [
    "A média nem dekódolható vagy túllépte a feldolgozási keretet. Tölts fel másik fájlt.",
    "The media could not be decoded or exceeded processing limits. Upload another file.",
  ],
  [
    "A feldolgozó ideiglenes tárhelye megtelt. Jelezd az adminnak; a fájl újrapróbálható.",
    "The processor ran out of temporary storage. Contact an admin, then upload the file again.",
  ],
  [
    "A fájl feldolgozása többször megszakadt. Töltsd fel újra.",
    "File processing was interrupted repeatedly. Upload it again.",
  ],
  ["MP3-, WAV- vagy OGG-hangfájl szükséges.", "Upload an MP3, WAV or OGG audio file."],
  ["A fájl csak hangot tartalmazhat.", "The file must contain audio only."],
  ["A profilhang hossza 3–5 másodperc legyen.", "Profile sounds must be 3–5 seconds long."],
  ["PNG/APNG-, GIF- vagy WebP-kép szükséges.", "Upload a PNG/APNG, GIF or WebP image."],
  [
    "A kép legfeljebb 2048×2048 képpontos és 300 képkockás lehet, 50 millió összesített képpontig.",
    "Images must be at most 2048×2048 pixels and 300 frames, with at most 50 million decoded pixels in total.",
  ],
  ["Az APNG túl sok képkockát tartalmaz.", "The APNG contains too many frames."],
]);
export function displayMediaError(error: string | null): string | null {
  return error ? (legacy.get(error) ?? error) : null;
}
