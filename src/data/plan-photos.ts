// The photographs on a plan's own page, by slug. Amelia is sending hers; until
// a plan has one, its page opens on the overview instead.
//
// Kept apart from plans.ts on purpose: the tests read that file directly, and
// an image import belongs to the build.

import type { ImageMetadata } from 'astro';
import type { Locale } from '../i18n/ui';
import stadium from '../assets/stadium-twilight.webp';

export interface PlanPhoto {
  src: ImageMetadata;
  alt: Record<Locale, string>;
  /** Where the crop holds, as an object-position. */
  focus?: string;
}

export interface PlanPhotos {
  /** Her "photo first", at the top of the page. */
  hero?: PlanPhoto;
  /** Her "stadium/game atmosphere" photo, under the experience text. */
  experience?: PlanPhoto;
}

export const planPhotos: Record<string, PlanPhotos | undefined> = {
  'dodgers-transfer': {
    // A stand-in until hers arrives: a ballpark at twilight, made for this
    // spot, with no team's name or mark on it. It opens the page; the slot
    // under the experience stays empty rather than show it twice.
    hero: {
      src: stadium,
      alt: {
        en: 'A full ballpark at twilight, its field lit, palm trees beyond the outfield',
        ja: '夕暮れの野球場。満員のスタンドと、ライトに照らされたグラウンド',
      },
    },
  },
};
