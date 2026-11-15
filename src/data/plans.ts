// Plans in Amelia's own format. The layout is her plan page of 2026-11-05
// (brief section 10A), drawn for the Dodgers transfer and meant for every
// plan: a photo, an overview with three icon tiles, a price card, what the
// experience is and what the service includes, two accordions of terms, and
// a closing panel. Her Japanese is verbatim; the English is derived from it.
// Prices are hers, fixed, in yen, per 組 (group). She has not given dollar
// figures yet.
//
// Adding a plan is an entry here, a card in offerings.ts with the same slug,
// and its photo in plan-photos.ts once she sends one. The page renders from
// this and holds no copy of its own beyond the labels every plan shares.

import type { Locale } from '../i18n/ui';
import type { Text } from '../i18n/text';
import type { IconName } from './icons';

type Copy = Record<Locale, string>;

/** One row of the price card: a label and a fixed yen amount per group. */
export interface PriceRow {
  label: Copy;
  yen: number;
}

/** One of the three tiles under the introduction. */
export interface Tile {
  icon: IconName;
  label: Copy;
}

/** A label and its value, as in her ご利用について rows. */
export interface UsageRow {
  label: Copy;
  value: Copy;
}

/** A labelled part of an accordion: its paragraphs, then its bullets. */
export interface DetailBlock {
  heading?: Copy;
  paragraphs?: Record<Locale, string[]>;
  bullets?: Record<Locale, string[]>;
}

/** One accordion. `cancellation` adds her cancellation terms at its end. */
export interface Details {
  label: Copy;
  blocks: DetailBlock[];
  cancellation?: boolean;
}

export interface Plan {
  /** Route segment, and the offering id of its card. */
  slug: string;
  /** The small label over the title. Where a language has none, the tier labels it. */
  eyebrow?: Partial<Copy>;
  /** The page heading, as phrases: on a narrow screen it folds between them, nowhere else. */
  title: Record<Locale, Text>;
  /** One sentence for search results and link previews. Not shown on the page. */
  description: Copy;
  intro: Record<Locale, Text>;
  tiles: Tile[];
  prices: PriceRow[];
  /** What one price buys: ／1組, per group. */
  unit: Copy;
  /** The small line under the prices. */
  priceNote: Copy;
  experience: {
    title: Record<Locale, Text>;
    body: Record<Locale, Text>;
  };
  /** Her check-mark rows under サービス内容. */
  services: Record<Locale, string[]>;
  /** Her label and value rows under ご利用について. */
  usage: UsageRow[];
  details: Details[];
  /** The line in the closing panel. */
  closing: Record<Locale, Text>;
}

export const plans: Plan[] = [
  {
    slug: 'dodgers-transfer',
    // Her eyebrow, DODGERS GAME TRANSFER, is English on the Japanese page:
    // written in mixed case and set in capitals by the style, so a screen
    // reader says words rather than letters. On the English page it would all
    // but repeat the title, so the tier labels it there.
    eyebrow: { ja: 'Dodgers game transfer' },
    title: {
      en: 'Dodgers game private transfer',
      // One line where it fits; where it does not, her break after 観戦.
      ja: ['ドジャース観戦', 'プライベート送迎'],
    },
    // Her subtitle of 2026-10-23, which led the page before.
    description: {
      en: 'Hotel to Dodger Stadium and back, with support in Japanese. One way or round trip.',
      ja: 'ホテル⇔ドジャースタジアムの送迎を日本語でサポート。片道・往復どちらも対応しています。',
    },
    intro: {
      en: 'From before the first pitch to after the last out: a fully private transfer, in Japanese, for a more comfortable day at Dodger Stadium.',
      ja: ['試合前から試合終了後まで。', '日本語対応の完全貸切送迎で、', 'ドジャース観戦をもっと快適に。'],
    },
    tiles: [
      { icon: 'car', label: { en: 'Fully private', ja: '完全貸切' } },
      { icon: 'users', label: { en: '1 to 4 guests', ja: '1〜4名様' } },
      { icon: 'chat', label: { en: 'In Japanese', ja: '日本語対応' } },
    ],
    prices: [
      { label: { en: 'One way', ja: '片道送迎' }, yen: 49800 },
      { label: { en: 'Round trip', ja: '往復送迎' }, yen: 79800 },
    ],
    unit: { en: 'per group', ja: '／1組' },
    priceNote: { en: 'Per group, up to 4 guests', ja: '1組あたりの料金・定員4名様' },
    experience: {
      title: {
        en: 'The game, with more freedom and more comfort.',
        ja: ['観戦を、', 'もっと自由に。', 'もっと快適に。'],
      },
      body: {
        en: 'So that you can enjoy the big game without a thought for getting there and back: a private vehicle between where you are staying and Dodger Stadium.',
        ja: '大切な試合の日を、移動の心配なく楽しんでいただくために。ご宿泊先とドジャースタジアム間を、プライベート車両でご案内します。',
      },
    },
    services: {
      en: [
        'Between where you are staying and Dodger Stadium',
        'Pickup after the game (round trip, or the way back)',
        'Contact and support in Japanese, on the day',
      ],
      ja: [
        'ご宿泊先⇔ドジャースタジアムの送迎',
        '試合終了後のお迎え（往復・復路）',
        '日本語での連絡・当日のサポート',
      ],
    },
    usage: [
      {
        label: { en: 'Service area', ja: '送迎エリア' },
        value: { en: 'Los Angeles and nearby', ja: 'ロサンゼルス市内・近郊' },
      },
      {
        label: { en: 'Group size', ja: 'ご利用人数' },
        value: { en: '1 to 4 guests', ja: '1〜4名様' },
      },
    ],
    // Her terms of 2026-10-23, in the two accordions she names. Her
    // cancellation answer joins the first, from the same data as the FAQ.
    details: [
      {
        label: { en: 'Pricing notes and extra charges', ja: '料金補足・追加料金' },
        blocks: [
          {
            heading: { en: 'Pricing notes', ja: '【料金補足】' },
            bullets: {
              en: [
                'The price shown covers the transfer between your hotel and Dodger Stadium.',
                'No extra charge for ordinary delays caused by game-day traffic or road restrictions.',
                'Large changes of time, additional stops or a change of area may carry an extra charge.',
                'Game tickets, parking and other out-of-pocket costs are not included in the price shown.',
                'If you would like us to buy game tickets on your behalf, please ask us separately.',
              ],
              ja: [
                '表示料金は、ご宿泊先⇔ドジャースタジアム間の送迎料金です。',
                '試合当日の交通渋滞や交通規制による通常範囲内の遅延について、追加料金は発生いたしません。',
                '大幅な時間変更、追加の立ち寄り、送迎エリアの変更等をご希望の場合は、別途料金が発生する場合がございます。',
                '観戦チケットおよび駐車場代等の実費は、表示料金に含まれておりません。',
                '観戦チケットの購入代行をご希望の場合は、別途ご相談ください。',
              ],
            },
          },
        ],
        cancellation: true,
      },
      {
        label: { en: 'On the day, and good to know', ja: '当日のご案内・注意事項' },
        blocks: [
          {
            heading: { en: 'Important information', ja: '【ご利用前にご確認ください】' },
            paragraphs: {
              en: [
                'On game days, crowds, traffic restrictions and road closures around Dodger Stadium may mean your pickup after the game moves to a designated spot nearby.',
                'We stay in contact with you throughout and explain the meeting point and how to reach it clearly, according to the conditions on the day.',
                'Safety and a smooth meeting come first. Thank you for your understanding.',
                'We cannot accept liability for losses arising from changes to game times, postponements or cancellations by the organizer, from weather, or from other unavoidable circumstances.',
              ],
              ja: [
                '試合当日はドジャースタジアム周辺の混雑、交通規制、道路封鎖等により、試合終了後のお迎え場所をスタジアム周辺の指定場所へ変更させていただく場合がございます。',
                '合流場所や方法については、お客様と随時ご連絡を取りながら、当日の状況に合わせて分かりやすくご案内いたします。',
                '安全かつスムーズな合流を最優先にご案内いたしますので、あらかじめご了承ください。',
                'また、主催者都合による試合時間の変更・延期・中止、天候その他やむを得ない事情による損害につきましては責任を負いかねます。',
              ],
            },
          },
          {
            heading: { en: 'Main service areas', ja: '【主な送迎エリア】' },
            paragraphs: {
              en: [
                'Los Angeles and its surroundings.',
                'Downtown, Hollywood, West Hollywood, Beverly Hills, Santa Monica, the Torrance area and more.',
                'Heading to Anaheim or Orange County? Ask us; we are glad to arrange it.',
              ],
              ja: [
                'ロサンゼルス市内・近郊',
                'ダウンタウン、ハリウッド、ウェストハリウッド、ビバリーヒルズ、サンタモニカ、トーランス周辺など',
                'アナハイム・オレンジカウンティ方面をご希望の場合もお気軽にご相談ください。',
              ],
            },
            bullets: {
              en: ['Pickup points other than hotels, on request'],
              ja: ['ホテル以外の送迎場所もご相談可能'],
            },
          },
          {
            heading: { en: 'Group size', ja: '【ご利用人数について】' },
            paragraphs: {
              en: [
                'Our standard vehicle seats up to 4 guests.',
                'For more room and comfort, we recommend 1 to 3 guests.',
                'Please tell us the number of guests when you book.',
              ],
              ja: [
                '通常車両は、お客様4名様までご乗車可能です。',
                'よりゆったりと快適にご利用いただく場合は、1〜3名様でのご利用をおすすめしております。',
                'ご予約時に人数をお知らせください。',
              ],
            },
          },
        ],
      },
    ],
    closing: { en: 'A special day at the ballpark.', ja: '特別な観戦の一日を。' },
  },
];

export function planBySlug(slug: string): Plan | undefined {
  return plans.find((p) => p.slug === slug);
}

/** 49800 -> "49,800". Grouping only; no currency symbol. */
export function groupDigits(n: number): string {
  return n.toLocaleString('en-US');
}

/** The page writes the amount the way she does: 49,800円 / ¥49,800. */
export function yenAmount(n: number, locale: Locale): string {
  return locale === 'ja' ? `${groupDigits(n)}円` : `¥${groupDigits(n)}`;
}

/** The list card shows only the lowest price: 49,800円〜 / from ¥49,800. */
export function lowestPrice(plan: Plan, locale: Locale): string {
  const min = Math.min(...plan.prices.map((r) => r.yen));
  return locale === 'ja' ? `${groupDigits(min)}円〜` : `from ¥${groupDigits(min)}`;
}
