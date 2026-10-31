// Plans in Amelia's own format, from the sample she sent on 2026-10-23: a
// title and subtitle, a price table with one or more rows per group, an
// introduction, and labelled sections. Her Japanese is verbatim; the English is
// derived from it. Prices are hers, fixed, in yen, per 組 (group), with no
// conversion. She has not given dollar figures yet.
//
// Adding a plan is an entry here plus a card in offerings.ts with the same
// slug. The detail page and the list card render from this.

import type { Locale } from '../i18n/ui';

/** One row of the price table: a label, a fixed yen amount per group, capacity. */
export interface PriceRow {
  label: Record<Locale, string>;
  yen: number;
  capacity: Record<Locale, string>;
}

/** A labelled block below the introduction. Bullets, paragraphs, or both. */
export interface PlanSection {
  heading: Record<Locale, string>;
  paragraphs?: Record<Locale, string[]>;
  bullets?: Record<Locale, string[]>;
}

export interface Plan {
  /** Route segment, and the offering id of its card. */
  slug: string;
  title: Record<Locale, string>;
  subtitle: Record<Locale, string>;
  prices: PriceRow[];
  intro: Record<Locale, string[]>;
  sections: PlanSection[];
}

export const plans: Plan[] = [
  {
    slug: 'dodgers-transfer',
    title: {
      en: 'Dodgers Game Private Transfer',
      ja: 'ドジャース観戦 プライベート送迎',
    },
    subtitle: {
      en: 'Hotel to Dodger Stadium and back, with support in Japanese. One way or round trip.',
      ja: 'ホテル⇔ドジャースタジアムの送迎を日本語でサポート。片道・往復どちらも対応しています。',
    },
    prices: [
      {
        label: { en: 'One way', ja: '片道送迎' },
        yen: 49800,
        capacity: { en: '1 to 4 guests', ja: '定員1名〜4名' },
      },
      {
        label: { en: 'Round trip', ja: '往復送迎' },
        yen: 79800,
        capacity: { en: '1 to 4 guests', ja: '定員1名〜4名' },
      },
    ],
    intro: {
      en: [
        'A fully private transfer with support in Japanese, for the day you go to a Dodgers game in Los Angeles.',
        'The Dodgers, where Shohei Ohtani, Yoshinobu Yamamoto and Roki Sasaki have all the attention.',
        'So that you can enjoy a ballgame in Los Angeles to the last out without worrying about getting there and back, we take you from your hotel to Dodger Stadium and pick you up after the game.',
        'On game days the area around the stadium is very crowded, and after the game many people find the wait for an Uber or Lyft, and the confusion over where to board, unsettling.',
        'We stay in touch in Japanese and get you there and back as smoothly as the traffic and the restrictions around the stadium allow on the day.',
        'One way or round trip, as you prefer.',
      ],
      ja: [
        'ロサンゼルス・ドジャース観戦日にご利用いただける、日本語対応の完全プライベート送迎サービスです。',
        '大谷翔平選手、山本由伸選手、佐々木朗希選手の活躍でも注目を集めるドジャース。',
        'せっかくのロサンゼルスでの野球観戦を、行き帰りの移動を気にせず最後までお楽しみいただけるよう、ご宿泊先からドジャースタジアムまでの送迎、試合終了後のお迎えまでサポートいたします⚾',
        'ドジャース戦開催日はスタジアム周辺が大変混雑し、試合終了後はUber・Lyftなどの配車待ちや乗車場所の分かりにくさに不安を感じる方も多くいらっしゃいます。',
        '日本語で連絡を取りながら、当日の交通状況やスタジアム周辺の規制に合わせて、できる限りスムーズにご案内いたします。',
        '片道・往復どちらでもご利用いただけます。',
      ],
    },
    sections: [
      {
        heading: { en: 'Service includes', ja: '【サービス内容】' },
        bullets: {
          en: [
            'One-way or round-trip transfer between your hotel and Dodger Stadium',
            'A fully private vehicle',
            'Pickup after the game',
            'Japanese-language support from Japanese staff',
            'Guidance adapted to game-day traffic restrictions and crowds',
            'Pickup points other than hotels, on request',
          ],
          ja: [
            'ご宿泊先⇔ドジャースタジアムの片道または往復送迎',
            '完全プライベート車両',
            '試合終了後のお迎え',
            '日本人スタッフによる日本語サポート',
            '試合日の交通規制や混雑状況に合わせたご案内',
            'ホテル以外の送迎場所もご相談可能',
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
      {
        heading: { en: 'Before you book', ja: '【ご利用前にご確認ください】' },
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
    ],
  },
];

export function planBySlug(slug: string): Plan | undefined {
  return plans.find((p) => p.slug === slug);
}

/** 49800 -> "49,800". Grouping only; no currency symbol. */
export function groupDigits(n: number): string {
  return n.toLocaleString('en-US');
}

/** The detail page writes the amount the way she does: 49,800円 / ¥49,800. */
export function yenAmount(n: number, locale: Locale): string {
  return locale === 'ja' ? `${groupDigits(n)}円` : `¥${groupDigits(n)}`;
}

/** The list card shows only the lowest price: 49,800円〜 / from ¥49,800. */
export function lowestPrice(plan: Plan, locale: Locale): string {
  const min = Math.min(...plan.prices.map((r) => r.yen));
  return locale === 'ja' ? `${groupDigits(min)}円〜` : `from ¥${groupDigits(min)}`;
}
