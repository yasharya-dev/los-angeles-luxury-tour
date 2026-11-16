// Composes the browser and home-screen icons from her logo: the LA monogram
// in its ring, cut out of the lockup in src/assets/logo.png (the wordmark
// under it is left out), on the black of the header. Output is committed, so
// the build does not depend on this; rerun it when the logo changes.
//
//   node scripts/icons.mjs
//
// favicon.ico holds PNG images, which every browser since 2010 reads.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SOURCE = 'src/assets/logo.png';
const BLACK = { r: 16, g: 16, b: 16, alpha: 1 }; // #101010, the header

// The monogram is everything opaque above the wordmark. Find its box.
const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const wordmark = Math.round(info.height * 0.6); // the lockup's text starts below here
let [left, top, right, bottom] = [info.width, info.height, 0, 0];
for (let y = 0; y < wordmark; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 24) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
}
const side = Math.max(right - left, bottom - top) + 1;
const mark = await sharp(SOURCE)
  .extract({
    left: Math.round((left + right - side) / 2),
    top: Math.round((top + bottom - side) / 2),
    width: side,
    height: side,
  })
  .toBuffer();

/** The mark on black, `inset` of the square left as a margin each side. */
async function icon(size, inset) {
  const inner = Math.round(size * (1 - 2 * inset));
  const drawn = await sharp(mark).resize(inner, inner).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BLACK } })
    .composite([{ input: drawn, gravity: 'centre' }])
    .png()
    .toBuffer();
}

// A tab icon is tiny: the ring nearly fills it. A home-screen icon is masked
// to a rounded square by the phone, so the ring keeps clear of the corners.
const [ico16, ico32, ico48] = await Promise.all([icon(16, 0.04), icon(32, 0.04), icon(48, 0.04)]);
await writeFile('public/apple-touch-icon.png', await icon(180, 0.14));
await writeFile('public/icon-192.png', await icon(192, 0.14));

// ICONDIR, one ICONDIRENTRY per image, then the PNGs.
const images = [
  [16, ico16],
  [32, ico32],
  [48, ico48],
];
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach(([size, png], i) => {
  const at = 6 + 16 * i;
  head.writeUInt8(size, at);
  head.writeUInt8(size, at + 1);
  head.writeUInt8(0, at + 2);
  head.writeUInt8(0, at + 3);
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(png.length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
await writeFile('public/favicon.ico', Buffer.concat([head, ...images.map(([, png]) => png)]));

console.log(`mark at ${left},${top} to ${right},${bottom}; wrote favicon.ico, apple-touch-icon.png, icon-192.png`);
