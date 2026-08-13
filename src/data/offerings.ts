// Prices always carry the from-form. Her own posts contradict each other
// ("$2,650〜" vs a flat "$2,650" in the same post), so a floor is the safe read.
//
// Each offering has a native currency. The multi-day journeys are priced in
// USD; everything from her BUYMA listing is priced in yen, per group. Japanese
// pages lead in yen and English pages lead in USD, so one side of every pair is
// converted at ¥163. See the price.note string in i18n/ui.ts.
//
// Her BUYMA listing shows a channel discount. These are the original prices,
// which is what she asked us to publish.

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
  /** Second line under the price. Carries the unit, and the converted figure. */
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
    price: { en: 'from $2,650', ja: '約432,000円〜' },
    priceNote: { en: 'per person', ja: '（$2,650〜）／1名様' },
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
    price: { en: 'from $2,480', ja: '約404,000円〜' },
    priceNote: { en: '', ja: '（$2,480〜）／1名様' },
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
    price: { en: 'from $2,000', ja: '約326,000円〜' },
    priceNote: { en: 'for two', ja: '（$2,000〜）／2名様〜' },
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
    price: { en: 'from $360', ja: '約59,000円〜' },
    priceNote: { en: 'per person', ja: '（$360〜）／1名様' },
  },
  {
    id: 'charter',
    tier: 'day',
    // TODO(#7): no booking link. Her Linktree slug is `la-tour`.
    name: {
      en: 'Private charter tour',
      ja: '貸切プライベートツアー',
    },
    blurb: {
      en: '6 hours at your pace · guide and driver · LAX pickup available',
      ja: '6時間貸切・ガイドと専属ドライバー・LAX送迎対応',
    },
    price: { en: 'from $675', ja: '110,000円〜' },
    priceNote: { en: 'per group, 1 to 7', ja: '／1グループ（1〜7名様）' },
  },
  {
    id: 'la-day-tour',
    // TODO(#7): sold through BUYMA, so there may be no form to link.
        tier: 'day',
    name: {
      en: 'Los Angeles day tour',
      ja: 'ロサンゼルス1日観光',
    },
    blurb: {
      en: '8 hours from the airport · restaurants, shopping, check-in help',
      ja: '8時間貸切・LAXお迎え・ホテル送迎付き',
    },
    price: { en: 'from $785', ja: '128,000円〜' },
    priceNote: { en: 'per group, 1 to 5', ja: '／1グループ（1〜5名様）' },
  },
  {
    id: 'dodgers-game',
    // TODO(#7): sold through BUYMA, so there may be no form to link.
        tier: 'day',
    name: {
      en: 'Dodgers game experience',
      ja: 'ドジャース観戦・送迎付きツアー',
    },
    blurb: {
      en: '8 hours chartered · the ticket arranged · airport or hotel pickup',
      ja: '8時間完全貸切・チケット手配込み・空港またはホテルお迎え',
    },
    price: { en: 'from $785', ja: '128,000円〜' },
    priceNote: { en: 'per group, 1 to 5', ja: '／1グループ（1〜5名様）' },
  },

  {
    id: 'airport-transfer',
    tier: 'transport',
    // TODO(#7): no booking link. Her Linktree slug is `airport-hotel`.
    name: {
      en: 'LAX airport transfer',
      ja: '空港送迎（LAX⇔ホテル往復）',
    },
    blurb: {
      en: 'round trip · met at the terminal · check-in support · shopping stops',
      ja: '往復・ターミナル出口お出迎え・チェックインサポート・買い物立ち寄り可',
    },
    price: { en: 'from $725', ja: '118,000円〜' },
    priceNote: { en: 'per group, 1 to 5', ja: '／1グループ（1〜5名様）' },
  },
  {
    id: 'dodgers-ticket',
    // TODO(#7): sold through BUYMA, so there may be no form to link.
        tier: 'transport',
    name: {
      en: 'Dodgers ticket service',
      ja: 'ドジャース観戦チケット購入代行',
    },
    blurb: {
      en: 'section and seat chosen for you · stadium and pre-game tours too',
      ja: 'セクション・座席の指定可・スタジアムツアー／プリゲームツアーも',
    },
    price: { en: 'from $20', ja: '3,000円〜' },
    priceNote: { en: 'per booking', ja: '／1件' },
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
