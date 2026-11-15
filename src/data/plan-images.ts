// The photograph for each plan, by offering id. Amelia is supplying one per
// plan; until hers arrive, a plan shows a photo we already hold where one
// honestly fits, and the monogram tile where none does.
//
// Kept apart from offerings.ts on purpose: the Worker imports that file for
// plan names, and an image import would end up in the Worker bundle.

import type { ImageMetadata } from 'astro';
import type { Locale } from '../i18n/ui';
import dtla from '../assets/hero-dtla.jpg';
import dusk from '../assets/hero-dusk.jpg';
import malibu from '../assets/hero-malibu.jpg';
import architecture from '../assets/divider-architecture.jpg';

export interface PlanImage {
  src: ImageMetadata;
  /** For where the photo stands alone. On a card it is decorative. */
  alt: Record<Locale, string>;
  /** Where the crop holds, as an object-position. */
  focus?: string;
}

export const planImages: Record<string, PlanImage | undefined> = {
  charter: {
    src: dtla,
    alt: {
      en: 'Palm-lined road above downtown Los Angeles at golden hour',
      ja: '夕暮れのロサンゼルス。ヤシ並木とダウンタウンの眺め',
    },
    focus: '30% 50%',
  },
  'la-day-tour': {
    src: malibu,
    alt: {
      en: 'Waves breaking below a house on the Malibu coast',
      ja: 'マリブの海岸。波打ち際に建つ邸宅',
    },
    focus: '70% 50%',
  },
  'airport-transfer': {
    src: dusk,
    alt: {
      en: 'A plane crossing the sky above a beach street at dusk',
      ja: '夕暮れの海沿いの通りと、空を横切る飛行機',
    },
    focus: '50% 22%',
  },
  'mansion-dinner': {
    src: architecture,
    alt: {
      en: 'A modern hillside residence in glass and concrete',
      ja: 'ガラスとコンクリートのモダンな邸宅',
    },
  },
  // Her photo is still to come; the skyline beside Dodger Stadium stands in.
  'dodgers-transfer': {
    src: dtla,
    alt: {
      en: 'Palm-lined road above downtown Los Angeles at golden hour',
      ja: '夕暮れのロサンゼルス。ヤシ並木とダウンタウンの眺め',
    },
    focus: '30% 50%',
  },
};
