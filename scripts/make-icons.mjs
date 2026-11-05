// Generates app icons from assets/logo.png. Run with: npm run icons
import sharp from 'sharp';

const src = 'assets/logo.png';
const background = { r: 28, g: 32, b: 35, alpha: 1 };
// The artwork sits inside wide margins; crop to it so it reads at small sizes.
const art = { left: 230, top: 200, width: 560, height: 620 };
const cropped = await sharp(src).extract(art).png().toBuffer();

async function icon(size, artSize, out, format = 'png') {
  const inner = await sharp(cropped).resize(artSize, artSize, { fit: 'contain', background }).toBuffer();
  const img = sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: inner }]);
  await (format === 'webp' ? img.webp({ quality: 88 }) : img.png({ compressionLevel: 9, palette: true })).toFile(out);
}

await icon(192, 160, 'public/icons/icon-192.png');
await icon(512, 430, 'public/icons/icon-512.png');
// Maskable icons need the artwork inside the central safe zone.
await icon(512, 330, 'public/icons/icon-maskable-512.png');
await icon(180, 150, 'public/icons/apple-touch-icon.png');
await icon(64, 54, 'public/icons/favicon-64.png');
await icon(96, 80, 'public/logo-mark.webp', 'webp');
