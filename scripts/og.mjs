// Composes the Open Graph image from the existing photography and the logo.
// No text: the fonts are not on the machines that would build this, and the
// title and description already say the words. Output is committed, so the
// build does not depend on this; rerun it when the photograph or the logo
// changes.
//
//   node scripts/og.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const W = 1200;
const H = 630;
const out = process.argv[2] ?? 'public/og/default.jpg';

// The same scrim the hero uses, so the gold logo sits on the same plate.
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="rgb(8,8,8)" fill-opacity="0.55"/></svg>`,
);
// Large enough that the wordmark under the monogram still reads at the size
// LINE and iMessage render a card.
const logo = await sharp('src/assets/logo.png').resize(420, 420).toBuffer();

await mkdir(dirname(out), { recursive: true });
await sharp('src/assets/hero-dtla.jpg')
  .resize(W, H, { fit: 'cover', position: 'attention' })
  .composite([{ input: scrim }, { input: logo, gravity: 'centre' }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(out);

console.log(`wrote ${out}`);
