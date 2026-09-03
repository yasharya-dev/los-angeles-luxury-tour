// Japanese isn't a translation of the English. Both were written from Amelia's
// own published copy, so her set phrases (完全予約制, 安全＆安心, the sign-off)
// appear verbatim. Don't paraphrase them.
// Adding a locale: add the key here and a dictionary below. No markup changes.

export const locales = ['en', 'ja'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Each locale labelled in its own script, never translated.
export const localeNames: Record<Locale, string> = {
  en: 'EN',
  ja: '日本語',
};

export const ui = {
  en: {
    'site.title': 'Los Angeles Luxury Tour',
    'site.tagline': 'Private travel, designed and guided personally',

    'nav.experience': 'Experience',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'nav.home': 'Los Angeles Luxury Tour, home',
    'nav.main': 'Main',
    'nav.language': 'Language',
    'nav.skip': 'Skip to content',

    'toggle.theme': 'Switch between dark and light theme',
    'toggle.lang': 'Read this page in Japanese',

    'cta.begin': 'Begin the conversation',
    'cta.start': 'Start planning',
    'cta.journeys': 'View the journeys',
    'cta.days': 'View the days',
    'cta.transport': 'View transport',
    'cta.enquire': 'Enquire about this journey',
    'cta.back': 'Back to all journeys',

    'reservation.title': 'By Reservation Only',
    'reservation.note':
      'Every journey is arranged by appointment, around you. For popular dates, Dodgers home games especially, reserving early is recommended.',

    'tier.signature': 'Signature journeys',
    'tier.day': 'Day experiences',
    'tier.transport': 'Transport & support',

    'price.from': 'from',
    'price.perPerson': 'per person',
    'price.perHour': 'an hour',
    'price.note': 'Prices set in yen are shown here at ¥163 to the dollar.',

    'footer.signoff': 'Have a beautiful stay in Los Angeles.',
    'footer.email': 'Email',
    'footer.line': 'LINE',
    'footer.instagram': 'Instagram',
    'footer.threads': 'Threads',
    'footer.location': 'Los Angeles',
    'footer.privacy': 'Privacy',
    'footer.rights': '© 2026 Los Angeles Luxury Tour',
  },

  ja: {
    'site.title': 'Los Angeles Luxury Tour',
    'site.tagline': '完全予約制｜VIP送迎＆貸切プライベートツアー',

    'nav.experience': '旅のプラン',
    'nav.about': 'アメリアについて',
    'nav.contact': 'お問い合わせ',
    'nav.home': 'ロサンゼルス ラグジュアリーツアー ホーム',
    'nav.main': 'メインメニュー',
    'nav.language': '言語',
    'nav.skip': '本文へ移動',

    'toggle.theme': 'ダークモードとライトモードを切り替える',
    'toggle.lang': 'Read this page in English',

    'cta.begin': 'まずはご相談から',
    'cta.start': 'お問い合わせ',
    'cta.journeys': 'プランを見る',
    'cta.days': 'プランを見る',
    'cta.transport': 'プランを見る',
    'cta.enquire': 'このプランを相談する',
    'cta.back': 'プラン一覧へ戻る',

    'reservation.title': '完全予約制',
    'reservation.note':
      '完全予約制のため、満席前のご予約をおすすめしております。ドジャース戦のある日程は、特にお早めにご相談ください。',

    'tier.signature': '特別な滞在プラン',
    'tier.day': '1日の体験',
    'tier.transport': '送迎・サポート',

    'price.from': '',
    'price.perPerson': '／1名様',
    'price.perHour': '1時間',
    'price.note': '※ドル建ての料金は$1=163円で換算し、千円単位に四捨五入しています。',

    'footer.signoff': '心に残る、上質な旅となりますように。',
    'footer.email': 'メール',
    'footer.line': 'LINE',
    'footer.instagram': 'Instagram',
    'footer.threads': 'Threads',
    'footer.location': 'ロサンゼルス',
    'footer.privacy': 'プライバシーポリシー',
    'footer.rights': '© 2026 Los Angeles Luxury Tour',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UIKey = keyof (typeof ui)['en'];
