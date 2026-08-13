// Prices always carry the from-form. Her own posts contradict each other
// ("$2,650〜" vs a flat "$2,650" in the same post), so a floor is the safe read.
// Yen on JA pages only, at ¥163/$ rounded to the nearest ¥1,000.

import type { Locale } from '../i18n/ui';

export type Tier = 'signature' | 'day' | 'transport';

export interface Offering {
  id: string;
  tier: Tier;
  /** Set when the offering has its own detail page. */
  slug?: string;
  /** Her existing JotForm. Not replaced yet. */
  formUrl?: string;
  name: Record<Locale, string>;
  blurb: Record<Locale, string>;
  price: Record<Locale, string>;
  /** Second line under the price. Japanese carries the yen gloss here. */
  priceNote?: Partial<Record<Locale, string>>;
}

const JOTFORM = 'https://form.jotform.com';

export const offerings: Offering[] = [
  {
    id: 'dodgers-journey',
    tier: 'signature',
    slug: 'dodgers-journey',
    formUrl: `${JOTFORM}/251396890230156`,
    name: {
      en: 'Dodgers fan journey',
      ja: 'ドジャース観戦の旅',
    },
    blurb: {
      en: '4 nights, 6 days · three games, guided throughout',
      ja: '4泊6日・観戦3試合・ガイドと専属ドライバー付き',
    },
    price: { en: 'from $2,650', ja: '$2,650〜' },
    priceNote: { en: 'per person', ja: '（約432,000円〜）／1名様' },
  },
  {
    id: 'solo-plan',
    tier: 'signature',
    formUrl: `${JOTFORM}/251308655646159`,
    name: {
      en: 'Solo traveler plan',
      ja: 'ひとり旅プライベートプラン',
    },
    blurb: {
      en: '4 nights, 6 days · for one guest, at ease',
      ja: '4泊6日・1名様から、安心のひとり旅を',
    },
    price: { en: 'from $2,480', ja: '$2,480〜' },
    priceNote: { en: '', ja: '（約404,000円〜）／1名様' },
  },
  {
    id: 'mansion-dinner',
    tier: 'signature',
    slug: 'mansion-dinner',
    formUrl: `${JOTFORM}/251526764796168`,
    name: {
      en: 'Private mansion dinner',
      ja: '貸切邸宅ディナー',
    },
    blurb: {
      en: 'one evening, a private chef, for two',
      ja: '一夜限りの出張シェフ付きディナー体験',
    },
    price: { en: 'from $2,000', ja: '$2,000〜' },
    priceNote: { en: 'for two', ja: '（約326,000円〜）／2名様〜' },
  },
  {
    id: 'temecula',
    tier: 'day',
    slug: 'temecula',
    formUrl: `${JOTFORM}/251506264563052`,
    name: {
      en: 'Temecula winery day',
      ja: 'テメキュラ ワイナリー1日旅',
    },
    blurb: {
      en: 'wine country, 9:00 to 18:00, door to door',
      ja: '9:00〜18:00・ホテル発着・受賞ワイナリー3か所',
    },
    price: { en: 'from $360', ja: '$360〜' },
    priceNote: { en: 'per person', ja: '（約59,000円〜）／1名様' },
  },
  {
    id: 'charter',
    tier: 'day',
    // TODO(#9): confirm the live URL for the la-tour form. The three
    // slug-named forms were not captured as full URLs during discovery.
    name: {
      en: 'Private charter tour',
      ja: '貸切プライベートツアー',
    },
    blurb: {
      en: 'the city at your pace, guide and driver included',
      ja: '観光・ショッピング・街歩き。ガイドと送迎付き',
    },
    price: { en: 'from $70', ja: '1時間 $70〜' },
    priceNote: { en: 'an hour', ja: '（約11,000円〜）' },
  },
  {
    id: 'dodgers-concierge',
    tier: 'transport',
    // TODO(#9): confirm the live URL for the dodgers-concierge form.
    name: {
      en: 'Dodgers concierge',
      ja: 'ドジャース送迎コンシェルジュ',
    },
    blurb: {
      en: 'fully private game-day transport, waiting through the game',
      ja: '完全貸切。試合中も車両が待機します',
    },
    price: { en: 'from $1,380', ja: '$1,380〜' },
    priceNote: { en: '1 to 2 guests', ja: '（約225,000円〜）／1〜2名様' },
  },
  {
    id: 'airport-transfer',
    tier: 'transport',
    // TODO(#9): confirm the live URL for the airport-hotel form.
    name: {
      en: 'Airport transfer',
      ja: '空港送迎',
    },
    blurb: {
      en: 'met on arrival, parking and fuel included',
      ja: '駐車場代・ガソリン代込み。到着時にお出迎え',
    },
    price: { en: 'from $50', ja: '$50〜' },
    priceNote: { en: 'one way', ja: '（約8,000円〜）／片道' },
  },
];

// Capability only, no prices. Shopping is quoted per item; the a-la-carte
// tier appeared on one slide in May 2025 and never again, so treat it stale.
export const capabilities: Record<Locale, string> = {
  en: 'Shopping and proxy purchasing, restaurant reservations, and in-restaurant accompaniment can also be arranged, quoted individually.',
  ja: 'ショッピング代行・レストラン予約・飲食店での同行サポートも承ります（個別お見積り）。',
};

export const tierOrder: Tier[] = ['signature', 'day', 'transport'];

export function byTier(tier: Tier): Offering[] {
  return offerings.filter((o) => o.tier === tier);
}

export function bySlug(slug: string): Offering | undefined {
  return offerings.find((o) => o.slug === slug);
}
