// A booking request, as one set of rules for the form, the received page and
// the Worker: which choices a plan offers, what makes a request valid, and how
// it reads back. The Worker imports this, so nothing here may import an image.

import type { Locale } from '../i18n/ui';
import { threeYearsOn, todayInLA } from './calendar';
import { offerings } from './offerings';
import { plans, type Plan } from './plans';

type Copy = Record<Locale, string>;

/** A choice on the guests list: what the form sends, and what it says. */
export interface GuestOption {
  value: string;
  label: Copy;
}

const guests = (n: number): GuestOption => ({
  value: String(n),
  label: { en: n === 1 ? '1 guest' : `${n} guests`, ja: `${n}名様` },
});

// For a plan not yet in her format: the list the form has always offered.
const GENERAL: GuestOption[] = [
  ...[1, 2, 3, 4, 5].map(guests),
  { value: '6+', label: { en: '6 or more', ja: '6名様以上' } },
];

export function planFor(id: string): Plan | undefined {
  return plans.find((p) => p.slug === id);
}

/** Her plans offer their own capacity and, where she allows it, one more
    choice. Any other plan starts at its own minimum, if its price has one. */
export function guestOptions(id: string): GuestOption[] {
  const plan = planFor(id);
  if (!plan) {
    const min = offerings.find((o) => o.id === id)?.minGuests ?? 1;
    return GENERAL.filter((g) => g.value === '6+' || Number(g.value) >= min);
  }
  const list = Array.from({ length: plan.capacity }, (_, i) => guests(i + 1));
  if (plan.over) list.push({ value: 'over', label: plan.over.label });
  return list;
}

/** Whether a plan asks for a transfer type: it has more than one price. */
export const hasChoice = (plan: Plan | undefined): plan is Plan =>
  !!plan && plan.prices.length > 1;

/** A request, once checked: only values the site's own data can vouch for. */
export interface Booking {
  service: string;
  type: string;
  route: string;
  date: string;
  guests: string;
}

export type Problem = 'service' | 'type' | 'route' | 'date' | 'guests';

/** What is wrong, in the form's own words: on the form, and on the page a
    visitor without script lands on when a request is refused. */
export const problemText: Record<Locale, Record<Problem | 'name' | 'email' | 'missing', string>> = {
  ja: {
    service: 'プランを選択してください。',
    type: '送迎タイプを選択してください。',
    route: '送迎区間を選択してください。',
    // Also for a date already past, so it asks to check, not to choose.
    date: 'ご利用希望日をご確認ください。',
    guests: 'ご利用人数を選択してください。',
    name: 'お名前をご記入ください。',
    email: 'メールアドレスをご確認ください。',
    missing: '未記入の項目があります。',
  },
  en: {
    service: 'Please choose a plan.',
    type: 'Please choose a transfer.',
    route: 'Please choose a route.',
    date: 'Please check the date.',
    guests: 'Please tell us how many guests.',
    name: 'Please enter your name.',
    email: 'Please check the email address.',
    missing: 'A few fields still need attention.',
  },
};

/** A calendar date as the form sends it: YYYY-MM-DD, and a real one. */
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * Checks a request against the plan it names. What does not apply is dropped
 * (a route on a round trip); anything that is not one of the plan's own
 * choices is refused, so nothing a visitor typed can pose as a choice.
 */
export function checkBooking(
  input: Record<string, string | undefined>,
): { ok: true; booking: Booking } | { ok: false; problem: Problem } {
  const offering = offerings.find((o) => o.id === input.service);
  if (!offering) return { ok: false, problem: 'service' };
  const plan = planFor(offering.id);

  let type = '';
  let route = '';
  if (hasChoice(plan)) {
    const row = plan.prices.find((r) => r.id === input.type);
    if (!row) return { ok: false, problem: 'type' };
    type = row.id;
    if (row.route) {
      const way = plan.routes?.find((r) => r.id === input.route);
      if (!way) return { ok: false, problem: 'route' };
      route = way.id;
    }
  }

  // From today in Los Angeles, where the plan takes place: the same floor the
  // form's date picker has.
  const date = input.date ?? '';
  const today = todayInLA();
  if (!isDate(date) || date < today || date > threeYearsOn(today)) {
    return { ok: false, problem: 'date' };
  }
  const party = guestOptions(offering.id).find((g) => g.value === input.guests);
  if (!party) return { ok: false, problem: 'guests' };

  return { ok: true, booking: { service: offering.id, type, route, date, guests: party.value } };
}

/** 2026-12-05 reads 2026年12月5日（土） or Saturday, December 5, 2026. The
    weekday is there so a guest a day ahead in Japan notices a wrong day. */
export function formatDate(s: string, locale: Locale): string {
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (locale === 'ja') return `${y}年${m}月${d}日（${'日月火水木金土'[date.getUTCDay()]}）`;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const LABELS: Record<Locale, { title: string; type: string; route: string; date: string; guests: string }> = {
  // Her labels, from her received screen (brief of 2026-11-05).
  ja: { title: 'お申し込み内容', type: '送迎タイプ', route: '送迎区間', date: 'ご利用日', guests: '人数' },
  en: { title: 'Your request', type: 'Transfer', route: 'Route', date: 'Date', guests: 'Guests' },
};

export interface Summary {
  title: string;
  plan: string;
  rows: { label: string; value: string }[];
}

/** The plan, then her rows: what the received page and both emails show. */
export function summary(b: Booking, locale: Locale): Summary {
  const name = offerings.find((o) => o.id === b.service)?.name[locale] ?? b.service;
  const plan = planFor(b.service);
  const l = LABELS[locale];
  const rows: Summary['rows'] = [];
  const type = plan?.prices.find((r) => r.id === b.type);
  if (type) rows.push({ label: l.type, value: type.label[locale] });
  const route = plan?.routes?.find((r) => r.id === b.route);
  if (route) rows.push({ label: l.route, value: route.label[locale] });
  rows.push({ label: l.date, value: formatDate(b.date, locale) });
  const party = guestOptions(b.service).find((g) => g.value === b.guests);
  rows.push({ label: l.guests, value: party?.label[locale] ?? b.guests });
  return { title: l.title, plan: name, rows };
}

/** The received page's address carries the checked request, and nothing personal. */
export function receivedQuery(b: Booking): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(b)) if (value) q.set(key, value);
  return q.toString();
}

/** Her receipt to the guest (brief of 2026-11-05), and its English. */
export const receipt: Record<Locale, { subject: string; body: string[] }> = {
  ja: {
    subject: '【Los Angeles Luxury Tour】ご予約リクエスト受付完了',
    body: [
      'ご予約リクエストをいただき、ありがとうございます。',
      'ご希望の内容を受け付けました。',
      '空き状況を確認のうえ、通常24時間以内にご連絡いたします。',
      'なお、この時点ではご予約は確定しておりません。',
    ],
  },
  en: {
    subject: '[Los Angeles Luxury Tour] We have received your booking request',
    body: [
      'Thank you for your booking request.',
      'We have received the details below.',
      'We will check availability and reply, normally within 24 hours.',
      'Please note that your booking is not final yet.',
    ],
  },
};

/** Where the received page takes the Worker's summary. */
export const SUMMARY_MARK = '<!--llt:booking-summary-->';
