// Generates the PWA icons in public/icons from one SVG (P6.4). Run: node scripts/pwa-icons.mjs
// sharp ships with Next (image optimisation) — no extra dependency.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("../public/icons/", import.meta.url);
const BLUE = "#2563EB";

/**
 * "B" mark on the brand blue; `pad` shrinks the glyph into the maskable safe zone (80 %).
 * `badge` = Android notification badge: only the alpha channel is used → white glyph, no background.
 */
function svg(size, { rounded, pad, badge }) {
  const r = rounded ? size * 0.22 : 0;
  const font = size * (pad ? 0.5 : badge ? 0.8 : 0.62);
  const bg = badge ? "" : `<rect width="${size}" height="${size}" rx="${r}" fill="${BLUE}"/>`;
  const dot = badge
    ? ""
    : `<circle cx="${size * (pad ? 0.71 : 0.72)}" cy="${size * (pad ? 0.3 : 0.28)}" r="${size * (pad ? 0.042 : 0.05)}" fill="#10B981"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif"
    font-weight="900" font-size="${font}" fill="#ffffff">B</text>
  ${dot}
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "icon-maskable-512.png", size: 512, pad: true },
  { file: "apple-touch-icon.png", size: 180, pad: true },
  { file: "badge-96.png", size: 96, badge: true },
];

await mkdir(OUT, { recursive: true });
await writeFile(new URL("icon.svg", OUT), svg(512, { rounded: true }));
for (const i of ICONS) {
  await sharp(Buffer.from(svg(i.size, i)))
    .png()
    .toFile(new URL(i.file, OUT).pathname);
  console.log("wrote", i.file);
}
