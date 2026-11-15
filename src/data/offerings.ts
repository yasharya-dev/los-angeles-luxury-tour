// Prices always carry the from-form. Her own posts contradict each other
// ("$2,650〜" vs a flat "$2,650" in the same post), so a floor is the safe read.
//
// Each offering has a native currency. The multi-day journeys are priced in
// USD; everything from her BUYMA listing is priced in yen, per group. Japanese
// pages lead in yen and English pages lead in USD, so one side of every pair is
// converted at ¥163 and marked 約. The rate itself is not printed anywhere: she
// asked for it to go (2026-11-05), and her fixed prices in both currencies
// replace the conversions when they arrive.
//
// Her BUYMA listing shows a channel discount. These are the original prices,
// which is what she asked us to publish.

import type { Locale } from '../i18n/ui';

// The site's English uses em dashes; a guard blocks the literal character.
const EM = String.fromCharCode(0x2014);

export type Tier = 'signature' | 'day' | 'transport';

export interface Offering {
  id: string;
  tier: Tier;
  /** Set when the offering has its own detail page. */
  slug?: string;
  name: Record<Locale, string>;
  blurb: Record<Locale, string>;
  price: Record<Locale, string>;
  /** Second line under the price. Carries the unit, and the converted figure. */
  priceNote?: Partial<Record<Locale, string>>;
  /** For a plan without its own page: what its card opens to show. */
  detail?: Record<Locale, PlanDetail>;
}

export interface PlanDetail {
  body: string;
  /** What the price leaves out, when there is something to say. */
  excl?: string;
}

export const offerings: Offering[] = [
  {
    id: 'dodgers-journey',
    tier: 'signature',
    slug: 'dodgers-journey',
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
    name: {
      en: 'Solo traveler plan',
      ja: 'ひとり旅プライベートプラン',
    },
    blurb: {
      en: '4 nights, 6 days · for one guest, at ease',
      ja: '4泊6日・1名様から、安心のひとり旅を',
    },
    price: { en: 'from $2,480', ja: '約404,000円〜' },
    priceNote: { en: 'per person', ja: '（$2,480〜）／1名様' },
    detail: {
      en: {
        body: `One game with round-trip stadium transfers, a full day of sightseeing, hotel check-in assistance, and easy stops ${EM} supermarkets, restaurants, wherever the day leads. Additional games can be added at $150 each.`,
        excl: 'Hotel and airfare are not included.',
      },
      ja: {
        body: '観戦1試合（スタジアム往復送迎付き）、終日観光ツアー、ホテルチェックインのお手伝い。スーパーやレストランへの立ち寄りも、柔軟にご一緒します。観戦の追加は1試合$150にて。',
        excl: '※ホテル代・航空券は含まれません。',
      },
    },
  },
  {
    id: 'mansion-dinner',
    tier: 'signature',
    slug: 'mansion-dinner',
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
    detail: {
      en: {
        body: 'Six hours, one to seven guests, with a guide and a dedicated driver. Sightseeing, shopping, neighbourhoods, whatever the day is for. LAX pickup can be built in.',
        excl: 'Meals, event tickets, and activity fees are not included.',
      },
      ja: {
        body: '6時間の貸切。1〜7名様まで、日本語ガイドと専属ドライバーがご一緒します。観光もショッピングも街歩きも、その日のご希望のままに。LAXでのお迎えも承ります。',
        excl: '※お食事代・イベントチケット・アクティビティ費用は含まれません。',
      },
    },
  },
  {
    id: 'la-day-tour',
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
    detail: {
      en: {
        body: 'Eight hours, collected from LAX and delivered to your hotel. Restaurants, shopping, and help at check-in, so the first day of the trip is not the hardest one.',
        excl: 'Meals, event tickets, and activity fees are not included.',
      },
      ja: {
        body: '8時間の貸切。LAXでお迎えし、ホテルまでお送りします。レストランやショッピング、チェックインのお手伝いまで。旅のはじめの一日を、いちばん大変な日にしないために。',
        excl: '※お食事代・イベントチケット・アクティビティ費用は含まれません。',
      },
    },
  },
  {
    id: 'dodgers-game',
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
    detail: {
      en: {
        body: 'Eight hours fully chartered around the game, with the ticket arranged for you. Collected from the airport or your hotel, and no waiting in the rideshare line afterwards.',
        excl: 'Food and merchandise at the stadium are not included.',
      },
      ja: {
        body: '観戦を中心に8時間を完全貸切。チケットの手配も承ります。空港またはホテルまでお迎えにあがり、試合後に配車の列へ並ぶ必要もありません。',
        excl: '※球場でのお食事代・グッズ代は含まれません。',
      },
    },
  },

  {
    id: 'airport-transfer',
    tier: 'transport',
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
    detail: {
      en: {
        body: 'LAX to your hotel and back again. Met at the terminal exit, helped through check-in, and a shopping stop on the way if you would like one.',
      },
      ja: {
        body: 'LAXとホテルの往復。ターミナル出口でお出迎えし、チェックインまでサポートいたします。ご希望に応じて、買い物への立ち寄りも可能です。',
      },
    },
  },
  {
    // Her sample plan (2026-10-23), in her format. Detail in data/plans.ts.
    // Prices are hers, fixed, in yen, per group; no dollar figure yet.
    id: 'dodgers-transfer',
    tier: 'transport',
    slug: 'dodgers-transfer',
    name: {
      en: 'Dodgers game private transfer',
      ja: 'ドジャース観戦 プライベート送迎',
    },
    // Her subtitle, verbatim, doubles as the card line.
    blurb: {
      en: 'Hotel to Dodger Stadium and back, with support in Japanese. One way or round trip.',
      ja: 'ホテル⇔ドジャースタジアムの送迎を日本語でサポート。片道・往復どちらも対応しています。',
    },
    price: { en: 'from ¥49,800', ja: '49,800円〜' },
    priceNote: { en: 'per group', ja: '／1組' },
  },
  {
    id: 'dodgers-ticket',
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
    detail: {
      en: {
        body: 'Tickets bought on your behalf, with the section and seat chosen to suit you. Stadium tours and pre-game tours can be booked the same way.',
        excl: 'The face value of the ticket is charged separately.',
      },
      ja: {
        body: '観戦チケットを代わりにお求めします。セクションも座席もご希望に合わせてお選びいただけます。スタジアムツアーやプリゲームツアーも同様に承ります。',
        excl: '※チケット代金は別途申し受けます。',
      },
    },
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

/** The plan's own booking page. */
export function bookPath(o: Pick<Offering, 'id'>): string {
  return `/book/${o.id}`;
}

/** The consultation form, with this plan pre-selected. */
export function consultPath(o: Pick<Offering, 'id'>): string {
  return `/consult?service=${o.id}`;
}
