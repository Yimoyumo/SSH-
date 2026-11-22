const DEFAULT_FONT = "Ubuntu Sans Mono";

export const DOWNLOADABLE_FONTS = ["JetBrains Mono", "Fira Code"];

export async function registerFont(family: string, dataBase64: string): Promise<void> {
  const bin = atob(dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const face = new FontFace(family, bytes.buffer);
  await face.load();
  document.fonts.add(face);
}

export function isMonospaceFamily(family: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return true;
  ctx.font = `14px "${family}"`;
  const wide = ctx.measureText("W").width;
  const narrow = ctx.measureText("i").width;
  return wide > 0 && Math.abs(wide - narrow) < 0.01;
}

export function resolveTerminalFont(family: string): string {
  return isMonospaceFamily(family) ? family : DEFAULT_FONT;
}

export const FALLBACK_FONT = DEFAULT_FONT;
