// Amelia's cancellation terms, as her FAQ gives them (2026-10-22). One place:
// the contact page's FAQ and every plan page read this, so the two cannot
// drift apart when she changes a number. These are her general terms; she has
// said plan-specific commercial terms will follow.

import type { Locale } from '../i18n/ui';

export interface Cancellation {
  question: string;
  lead: string;
  tiers: string[];
  after: string;
}

export const cancellation: Record<Locale, Cancellation> = {
  en: {
    question: 'Is there a cancellation fee?',
    lead: 'Depending on when you cancel:',
    tiers: ['Up to 7 days before: free', 'Up to 4 days before: 30%', 'After that: 100%'],
    after: 'The full cancellation policy comes with your booking.',
  },
  ja: {
    question: 'キャンセル料はかかりますか？',
    lead: 'キャンセル時期に応じて、以下のキャンセル料が発生いたします。',
    tiers: ['7日前まで：無料', '4日前まで：30%', 'それ以降：100%'],
    after: '詳細は、ご予約時にご案内するキャンセルポリシーをご確認ください。',
  },
};
