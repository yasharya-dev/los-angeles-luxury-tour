// Inclusion lists are hers, from her published carousels. Two of her own
// contradictions are resolved conservatively: the Dodgers "premium gift" is on
// the title card but not the price table, so it is omitted; Temecula's olive
// oil tasting is in two of three sources, so it is included.

import type { Locale } from '../i18n/ui';

export interface ScheduleRow {
  time: string;
  title: Record<Locale, string>;
  note?: Record<Locale, string>;
}

export interface Journey {
  slug: string;
  offeringId: string;
  kicker: Record<Locale, string>;
  title: Record<Locale, string[]>;
  lead: Record<Locale, string>;
  includes: Record<Locale, string[]>;
  excludes: Record<Locale, string[]>;
  schedule?: ScheduleRow[];
  scheduleNote?: Record<Locale, string>;
}

export const journeys: Journey[] = [
  {
    slug: 'dodgers-journey',
    offeringId: 'dodgers-journey',
    kicker: { en: 'Signature journey', ja: '特別な滞在プラン' },
    title: {
      en: ['Dodgers fan journey'],
      ja: ['ドジャース観戦の旅'],
    },
    lead: {
      en: 'Four nights and six days built around three games, with the stadium tour, the murals, the food, and the city between them. Guided end to end.',
      ja: '4泊6日、観戦3試合を中心に。スタジアムツアーも、壁画巡りも、グルメも、その合間の街歩きまで。最初から最後までご一緒します。',
    },
    includes: {
      en: [
        'Round-trip airport and hotel transfers',
        'Three game tickets, with round-trip stadium transport',
        'Stadium tour and pre-game tour tickets',
        'Dodgers Clubhouse, for the merchandise',
        'The murals, Hollywood, In-N-Out, and Pink’s',
        'A dedicated driver and Japanese-language guide throughout',
        'Fuel and parking',
      ],
      ja: [
        '空港・ホテル間の往復送迎',
        '観戦チケット3試合分（スタジアム往復送迎付き）',
        'スタジアムツアー・プレゲームツアーのチケット',
        'ドジャースクラブハウスでのグッズ巡り',
        '話題の壁画巡り・ハリウッド観光・In-N-Out・ピンクス',
        '専属ドライバーと日本語ガイドによる終日サポート',
        'ガソリン代・駐車場代',
      ],
    },
    excludes: {
      en: [
        'Meals',
        'Shopping',
        'Hotel',
        'International airfare',
        'Other personal expenses',
      ],
      ja: [
        '食事代',
        'ショッピング代',
        'ホテル宿泊費',
        '往復渡航費',
        'その他個人的な費用',
      ],
    },
    scheduleNote: {
      en: 'Days are shaped around the fixture list, so the order moves with the schedule. Bobblehead giveaway dates are worth planning around.',
      ja: '日程は試合日程に合わせて組み立てます。ボブルヘッド配布日に合わせたプランもおすすめです。',
    },
  },

  {
    slug: 'temecula',
    offeringId: 'temecula',
    kicker: { en: 'Day experience', ja: '1日の体験' },
    title: {
      en: ['Temecula winery day'],
      ja: ['テメキュラ ワイナリー1日旅'],
    },
    lead: {
      en: 'Southern California wine country, about two and a half hours each way, returning the same evening. A dedicated driver both ways, and no need to think about anything.',
      ja: '南カリフォルニアのワインカントリーへ。片道およそ2時間半、日帰りで訪れる大人の余裕旅。往復とも専属ドライバーがご一緒しますので、何も気にせずお過ごしください。',
    },
    includes: {
      en: [
        'Round-trip transport with a dedicated driver',
        'A tasting tour at three award-winning wineries',
        'Old Town, and an olive oil tasting',
        'A private vehicle for the day',
        'Japanese-language guide support',
      ],
      ja: [
        '往復送迎（専属ドライバー）',
        '受賞歴あるワイナリー3軒でのテイスティングツアー',
        'オールドタウン散策、オリーブオイルテイスティング',
        'お客様専用車による移動',
        '日本語ガイドによるサポート',
      ],
    },
    excludes: {
      en: [
        'Meals, including lunch',
        'Wine tasting fees, from about $20 per winery',
        'Hotel and airfare',
        'Other personal expenses',
      ],
      ja: [
        '食事代（ランチ代等）',
        'ワインテイスティング代（1軒あたり$20〜）',
        'ホテル宿泊費・往復航空賃',
        'その他個人的な費用',
      ],
    },
    schedule: [
      {
        time: '9:00',
        title: { en: 'Leave your hotel', ja: 'ホテル出発' },
        note: {
          en: 'Picked up from your accommodation in Los Angeles.',
          ja: 'ロサンゼルス市内のご宿泊先へお迎えに伺います。',
        },
      },
      {
        time: '11:15',
        title: { en: 'Arrive in Temecula Old Town', ja: 'テメキュラ・オールドタウン到着' },
        note: {
          en: 'Olive oil tasting first, then Old Town and lunch. Guided or on your own, at the same price.',
          ja: 'まずはオリーブオイルテイスティングへ。その後、オールドタウン散策と昼食を。ガイド付きでも自由散策でも、料金は同一です。',
        },
      },
      {
        time: '13:15',
        title: { en: 'Head for the winery road', ja: 'ワイナリー街道に向けて出発' },
      },
      {
        time: '13:30',
        title: { en: 'Three wineries', ja: 'ワイナリー到着' },
        note: {
          en: 'Four to six wines at each. Sharing between your party is fine.',
          ja: 'テメキュラを代表する3軒を巡ります。1軒4〜6種ほどをお試しいただけ、ご同行者とのシェアも可能です。',
        },
      },
      {
        time: '16:00',
        title: { en: 'Leave Temecula', ja: 'テメキュラ出発' },
      },
      {
        time: '18:00',
        title: { en: 'Back at your hotel', ja: 'ホテル到着' },
      },
    ],
    scheduleNote: {
      en: 'Timings shift a little with the day.',
      ja: '※スケジュールは前後する可能性がございます。予めご了承ください。',
    },
  },

  {
    slug: 'mansion-dinner',
    offeringId: 'mansion-dinner',
    kicker: { en: 'Signature journey', ja: '特別な滞在プラン' },
    title: {
      en: ['Private mansion dinner'],
      ja: ['大人の贅沢邸宅ディナー'],
    },
    lead: {
      en: 'A luxury residence in Hollywood or Santa Monica, reserved for one evening. A chef trusted by VIPs finishes each course in front of you.',
      ja: 'ハリウッドやサンタモニカの高級邸宅を貸し切り、一夜限りの特別なディナーを。多くのVIPや著名人に愛されるシェフが、目の前で仕上げる特別な一皿をお届けします。',
    },
    includes: {
      en: [
        'Private use of the residence for the evening',
        'A chef, cooking in front of you',
        'Your choice of sushi, steak, French or Italian courses',
        'Round-trip transport between your hotel and the residence',
        'A Japanese-language guide, if you would like one',
      ],
      ja: [
        '邸宅の貸し切り利用',
        '出張シェフによるコースディナー',
        '鮨・ステーキ・フレンチ・イタリアンからお好きな料理をお選びいただけます',
        'ホテルから邸宅への往復送迎',
        '日本語ガイド（ご要望に応じて）',
      ],
    },
    excludes: {
      en: ['Drinks, which you may bring or add as an option'],
      ja: ['※飲み物代別（持参または別途オプション）'],
    },
    scheduleNote: {
      en: 'Built for anniversaries and for evenings that need to be right.',
      ja: '特別な記念日や、大切な方との旅の一夜に。',
    },
  },
];

export function journeyBySlug(slug: string): Journey | undefined {
  return journeys.find((j) => j.slug === slug);
}
