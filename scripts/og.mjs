// Composes the Open Graph image from the homepage photograph and the logo.
// No text: the fonts are not on the machines that would build this, and the
// title and description already say the words. Output is committed, so the
// build does not depend on this; rerun it when the photograph, the logo or
// this script changes. The build test runs it to a temporary file and fails
// when the committed image no longer matches.
//
//   node scripts/og.mjs [out]
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const W = 1200;
const H = 630;
const out = process.argv[2] ?? 'public/og/default.jpg';

// The logo sits over the sunset, left of the sign, so the sign stays whole.
// Its drawn part runs from about x 338 to 542: whole inside the centred
// square some apps cut a preview to (x 285 to 915), and clear of the sign's
// H at about x 605. The hero's warm brown deepens behind the logo and clears
// toward the sign, so the gold reads without dimming the picture.
const LOGO = 300;
const LOGO_X = 290;
const scrim = Buffer.from(
  `<svg width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="rgb(24,16,10)" stop-opacity="0.72"/>
        <stop offset="0.45" stop-color="rgb(24,16,10)" stop-opacity="0.6"/>
        <stop offset="0.75" stop-color="rgb(24,16,10)" stop-opacity="0.22"/>
        <stop offset="1" stop-color="rgb(24,16,10)" stop-opacity="0.12"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`,
);
// At the 240 to 300px LINE and iMessage draw a card at, LOS ANGELES under
// the monogram still reads; LUXURY TOUR is small there, as it was at 380.
const logo = await sharp('src/assets/logo.png').resize(LOGO, LOGO).toBuffer();

await mkdir(dirname(out), { recursive: true });
await sharp('src/assets/hero-hollywood.webp')
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .composite([
    { input: scrim },
    { input: logo, left: LOGO_X, top: Math.round((H - LOGO) / 2) },
  ])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(out);

console.log(`wrote ${out}`);
