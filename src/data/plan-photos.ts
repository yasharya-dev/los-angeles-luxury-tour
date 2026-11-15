// The photographs on a plan's own page, by slug. Amelia is sending hers; until
// a plan has one, its page opens on the overview instead.
//
// Kept apart from plans.ts on purpose: the tests read that file directly, and
// an image import belongs to the build.

import type { ImageMetadata } from 'astro';
import type { Locale } from '../i18n/ui';
import dtla from '../assets/hero-dtla.jpg';

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
    // A stand-in until hers arrives: the skyline seen from the hills beside
    // the stadium. No stadium photo is held, so the second slot stays empty.
    hero: {
      src: dtla,
      alt: {
        en: 'Palm-lined road above downtown Los Angeles at golden hour',
        ja: '夕暮れのロサンゼルス。ヤシ並木とダウンタウンの眺め',
      },
      focus: '40% 50%',
    },
  },
};
