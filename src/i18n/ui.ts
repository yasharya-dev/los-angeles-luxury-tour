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

// The language spelled out, read after the visible label by a screen reader
// ("EN English"). In English for both: it is the one language every reader of
// either page is likely to recognise the other's name in.
export const localeGloss: Record<Locale, string> = {
  en: 'English',
  ja: 'Japanese',
};

export const ui = {
  en: {
    'site.title': 'Los Angeles Luxury Tour',
    'site.tagline': 'Private tours and transfers, by reservation only',

    'nav.experience': 'Experience',
    'nav.about': 'About us',
    'nav.contact': 'Contact',
    'nav.home': 'Los Angeles Luxury Tour, home',
    'nav.main': 'Main',
    'nav.menu': 'Menu',
    'nav.skip': 'Skip to content',

    'toggle.dark': 'Dark mode',

    'cta.back': 'Back to all plans',

    // A plan's three controls, the same words wherever a plan appears. The
    // booking form takes a request that she confirms, so it is "request".
    'plan.details': 'Details',
    'plan.request': 'Request this plan',
    'plan.ask': 'or ask a question first',
    'plan.services': 'What is included',
    'plan.usage': 'Service details',
    'plan.byReservation': 'By reservation only',

    'tier.signature': 'Signature journeys',
    'tier.day': 'Day experiences',
    'tier.transport': 'Transport & support',

    'footer.signoff': 'Have a beautiful stay in Los Angeles.',
    'footer.contact': 'Contact and social',
    'footer.email': 'Email',
    'footer.instagram': 'Instagram',
    'footer.facebook': 'Facebook',
    'footer.privacy': 'Privacy',
    'footer.rights': '© 2026 Los Angeles Luxury Tour',
    // California requires sellers of travel to show this on advertising. The
    // number itself is in data/contact.ts.
    'footer.sellerOfTravel': 'California Seller of Travel',
    'footer.registrationNo': 'Registration No.',
  },

  ja: {
    'site.title': 'Los Angeles Luxury Tour',
    'site.tagline': '完全予約制｜VIP送迎＆貸切プライベートツアー',

    'nav.experience': '旅のプラン',
    'nav.about': '私たちについて',
    'nav.contact': 'お問い合わせ',
    // Starts with the lockup's own lettering, which is what is on screen.
    'nav.home': 'Los Angeles Luxury Tour ホーム',
    'nav.main': 'メインメニュー',
    'nav.menu': 'メニュー',
    'nav.skip': '本文へ移動',

    'toggle.dark': 'ダークモード',

    'cta.back': 'プラン一覧へ戻る',

    // Hers: 「詳細を見る」 and 「このプランを申し込む」 from her brief of
    // 2026-11-05, 「まずは相談する」 from 2026-10-22.
    'plan.details': '詳細を見る',
    'plan.request': 'このプランを申し込む',
    'plan.ask': 'まずは相談する',
    // Hers, from the plan page in her brief of 2026-11-05.
    'plan.services': 'サービス内容',
    'plan.usage': 'ご利用について',
    'plan.byReservation': '完全予約制',

    'tier.signature': '特別な滞在プラン',
    'tier.day': '1日の体験',
    'tier.transport': '送迎・サポート',

    'footer.signoff': '心に残る、上質な旅となりますように。',
    'footer.contact': '連絡先・SNS',
    'footer.email': 'メール',
    'footer.instagram': 'Instagram',
    'footer.facebook': 'Facebook',
    'footer.privacy': 'プライバシーポリシー',
    'footer.rights': '© 2026 Los Angeles Luxury Tour',
    'footer.sellerOfTravel': 'California Seller of Travel',
    'footer.registrationNo': '登録番号',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UIKey = keyof (typeof ui)['en'];
