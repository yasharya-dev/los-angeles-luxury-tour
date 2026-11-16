import {
  gatePage,
  grantAccess,
  hasAccess,
  safeNext,
} from './beta';
import { offerings } from '../src/data/offerings';
import { CONTACT } from '../src/data/contact';
import {
  checkBooking,
  problemText,
  receipt,
  receivedQuery,
  summary,
  SUMMARY_MARK,
  type Booking,
  type Summary,
} from '../src/data/booking';
import { MAIL_DEADLINE } from '../src/data/deadlines';

// Serves the static build and handles the two forms: POST /api/inquiry is the
// consultation form, POST /api/booking is a booking request. Everything about
// handling them is shared; what differs is declared in SUBMISSIONS below.
//
// A booking request is checked against the plan's own data, mailed to her in
// full, and acknowledged to the guest with a receipt that carries only what
// that data can vouch for. Its received page shows the same summary, filled
// in here from the checked request the address carries.
//
// Resend does the actual sending: Cloudflare has no outbound email.
// Secrets: wrangler secret put RESEND_API_KEY / TURNSTILE_SECRET_KEY

interface Env {
  ASSETS: Fetcher;
  /** Set to gate the site for client review. Absent means the site is public. */
  BETA_PASSWORD?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  INQUIRY_TO?: string;
  INQUIRY_FROM?: string;
}

type Locale = 'en' | 'ja';
type Data = Record<string, string>;

/** One form, one endpoint. */
export interface Submission {
  /** Fields read from the form, in the order they appear in the email. */
  fields: readonly string[];
  /** Refused without these. The page validates too; this is the backstop. */
  required: readonly string[];
  subject: (data: Data, locale: Locale) => string;
  /** Where a no-JS post lands afterwards. */
  next: (locale: string) => string;
  /** A line above the table, when the email needs context she can act on. */
  intro?: string;
  /** A booking request: checked against the plan, and acknowledged to the guest. */
  booking?: true;
}

const jaTag = (locale: Locale) => (locale === 'ja' ? '（日本語）' : '');

export const SUBMISSIONS: Readonly<Record<string, Submission>> = {
  '/api/inquiry': {
    fields: [
      'name',
      'email',
      'service',
      'language',
      'guests',
      'dates',
      'hoping',
      'heard',
      'referrer',
    ],
    required: ['name', 'email', 'hoping'],
    subject: (d, locale) =>
      `Inquiry from ${d.name}` +
      (d.service ? ` - ${serviceLabel(d.service)}` : '') +
      jaTag(locale),
    next: thanksPath,
  },

  // A booking is a request: she checks availability and confirms, normally
  // within 24 hours. The intro line says so, in her inbox, every time.
  '/api/booking': {
    fields: ['service', 'type', 'route', 'date', 'guests', 'hotel', 'name', 'email', 'line', 'notes'],
    required: ['service', 'date', 'guests', 'name', 'email'],
    subject: (d, locale) =>
      `Booking request from ${d.name} - ${serviceLabel(d.service)}` +
      jaTag(locale),
    next: receivedPath,
    intro:
      'ご予約リクエストです。空き状況を確認のうえ、通常24時間以内にお客様へご返信ください。 / Booking request: check availability and reply to the guest, normally within 24 hours.',
    booking: true,
  },
};

/** The fields a visitor writes more than one line in. Everything else is one line. */
const MULTILINE = new Set(['hoping', 'notes']);

// Newlines survive; everything else in the control range doesn't.
export function clean(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** One line: a line break in a name would otherwise reach an email subject. */
export function cleanLine(value: FormDataEntryValue | null, max = 300): string {
  return clean(value, max).replace(/\s*[\r\n\t]+\s*/g, ' ');
}

/** One address, and only an address: no list, no name, no angle brackets. */
export function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@<>()[\]\,;:"]+@[^\s@<>()[\]\,;:".]+(\.[^\s@<>()[\]\,;:".]+)*\.[a-z]{2,}$/i.test(value)
  );
}

// The form sends the plan id. She reads the email, so show the plan in both
// languages; an id nothing matches is shown as sent rather than dropped.
export function serviceLabel(id: string): string {
  const o = offerings.find((x) => x.id === id);
  return o ? `${o.name.ja} / ${o.name.en}` : id;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function thanksPath(locale: string): string {
  return locale === 'ja' ? '/ja/thank-you' : '/thank-you';
}

export function receivedPath(locale: string): string {
  return locale === 'ja' ? '/ja/book/received' : '/book/received';
}

const RECEIVED = new Set([receivedPath('en'), receivedPath('ja')]);

async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string | null,
): Promise<boolean> {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const cell = 'padding:4px 14px 4px 0;color:#666;vertical-align:top';
const row = (label: string, value: string) =>
  `<tr><td style="${cell}">${escapeHtml(label)}</td>` +
  `<td style="padding:4px 0">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`;

// What a guest wrote, labelled for her, in the order of the form.
const PERSONAL: Record<string, string> = {
  hotel: 'ご宿泊先 / Staying at',
  name: 'お名前 / Name',
  email: 'メール / Email',
  line: 'LINE ID',
  notes: 'ご要望・備考 / Notes',
};

function emailHtml(sub: Submission, data: Data, booking?: Booking): string {
  let rows: string[];
  if (booking) {
    // The checked request in both languages, then what the guest wrote.
    const [ja, en] = [summary(booking, 'ja'), summary(booking, 'en')];
    rows = [
      row('プラン / Plan', serviceLabel(booking.service)),
      ...ja.rows.map((r, i) =>
        row(`${r.label} / ${en.rows[i].label}`, `${r.value} / ${en.rows[i].value}`),
      ),
      ...Object.keys(PERSONAL)
        .filter((f) => data[f])
        .map((f) => row(PERSONAL[f], data[f])),
    ];
  } else {
    rows = sub.fields
      .filter((f) => data[f])
      .map((f) => row(f, f === 'service' ? serviceLabel(data[f]) : data[f]));
  }
  const intro = sub.intro
    ? `<p style="margin:0 0 14px;color:#444">${escapeHtml(sub.intro)}</p>`
    : '';
  return (
    `<div style="font:15px/1.6 system-ui,sans-serif">${intro}` +
    `<table>${rows.join('')}</table></div>`
  );
}

/** Her summary block, for the received page. */
export function summaryHtml(s: Summary): string {
  const rows = s.rows
    .map((r) => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`)
    .join('');
  return (
    `<div class="received-summary">` +
    `<h2 class="received-summary__title">${escapeHtml(s.title)}</h2>` +
    `<p class="received-summary__plan">${escapeHtml(s.plan)}</p>` +
    `<dl class="received-summary__rows">${rows}</dl></div>`
  );
}

/** Her receipt to the guest: her words, then only what the plan's data vouches for. */
export function receiptMail(b: Booking, locale: Locale, site: string) {
  const r = receipt[locale];
  const s = summary(b, locale);
  const html =
    `<div style="font:15px/1.8 system-ui,sans-serif;color:#191919">` +
    `<p>${r.body.map(escapeHtml).join('<br>')}</p>` +
    `<p style="margin:20px 0 4px;font-weight:600">${escapeHtml(s.title)}</p>` +
    `<p style="margin:0 0 6px">${escapeHtml(s.plan)}</p>` +
    `<table>${s.rows.map((x) => row(x.label, x.value)).join('')}</table>` +
    `<p style="margin-top:24px;color:#666">Los Angeles Luxury Tour<br>${escapeHtml(site)}</p></div>`;
  const text =
    `${r.body.join('\n')}\n\n${s.title}\n${s.plan}\n` +
    s.rows.map((x) => `${x.label}: ${x.value}`).join('\n') +
    `\n\nLos Angeles Luxury Tour\n${site}\n`;
  return { subject: r.subject, html, text };
}

// What a visitor without script sees when a post is refused: a short page in
// their language that says what was wrong, with a way back. The link goes back
// in history where script runs (it usually does: a post that skipped the
// background send most often means only the form's module failed), which keeps
// what was typed; it falls back to the page itself.
const FAIL: Record<Locale, { check: string; send: string; back: string }> = {
  ja: {
    check: '送信できませんでした。前のページに戻り、入力内容をご確認ください。',
    send: '送信に失敗しました。お手数ですが直接ご連絡ください：',
    back: '前のページに戻る',
  },
  en: {
    check: 'We could not send that. Please go back and check the form.',
    // Ends in its space: the address follows straight on in every language.
    send: 'Something went wrong sending that. Please email us directly at ',
    back: 'Go back',
  },
};

function page(lang: string, body: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="${lang}"><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>Los Angeles Luxury Tour</title>` +
      `<style>body{max-width:32rem;margin:12vh auto;padding:0 20px;background:#faf9f6;color:#191919;` +
      `font:16px/1.9 "Noto Serif JP",Georgia,serif;word-break:keep-all;overflow-wrap:anywhere}` +
      `a{color:#806419;text-underline-offset:.3em}</style><body>` +
      `${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** Escaped, with a fold after each Japanese stop, comma and colon. The page
    sets keep-all, under which Safari folds nowhere else and cuts a word. */
const folds = (s: string, followed = false) =>
  escapeHtml(s)
    .replace(/([。、：])/g, '$1<wbr>')
    // At the very end only when something follows on the line: the address.
    .replace(/<wbr>$/, followed ? '<wbr>' : '');

function failPage(
  locale: Locale,
  kind: 'check' | 'send',
  back: string,
  status: number,
  problem?: string,
): Response {
  const f = FAIL[locale];
  const what = problem ? (problemText[locale] as Record<string, string>)[problem] : undefined;
  // Any space before the address is the copy's; folds() lets it fold after a
  // Japanese colon.
  const mail = kind === 'send' ? `<a href="mailto:${CONTACT.email}">${CONTACT.email}</a>` : '';
  return page(
    locale,
    `<p>${folds(f[kind], !!mail)}${mail}</p>` +
      (what ? `<p>${folds(what)}</p>` : '') +
      `<p><a href="${escapeHtml(back)}" onclick="history.back();return false">${folds(f.back)}</a></p>`,
    status,
  );
}

/** A post from another site's page. It has no language of its own: both. */
const forbidden = () =>
  page(
    'ja',
    '<p>このページからは送信できません。</p><p lang="en">This form cannot be sent from another site.</p>',
    403,
  );

/** More than any of the two forms can hold. */
const MAX_BODY = 64 * 1024;

async function sendMail(env: Env, mail: Record<string, unknown>): Promise<boolean> {
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), MAIL_DEADLINE);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mail),
      signal: stop.signal,
    });
    if (!res.ok) console.error('Resend failed', res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error('Resend did not answer', error);
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

async function handleSubmission(
  request: Request,
  env: Env,
  sub: Submission,
  url: URL,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  // Another site's page cannot post here on a visitor's behalf.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return forbidden();

  // Read the body only when it is a form, and of a size a form can be.
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) {
    return new Response('Too large', { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const wantsJson = (request.headers.get('Accept') ?? '').includes(
    'application/json',
  );
  const locale: Locale = clean(form.get('locale'), 8) === 'ja' ? 'ja' : 'en';

  // The way back from a refusal: the page the post came from, on this site.
  let back = locale === 'ja' ? '/ja' : '/';
  try {
    const from = new URL(request.headers.get('Referer') ?? '');
    if (from.origin === url.origin) back = from.pathname + from.search;
  } catch {
    /* no referrer: the home page it is */
  }

  const done = (next: string) =>
    wantsJson
      ? Response.json({ ok: true, next })
      : Response.redirect(new URL(next, url), 303);
  const fail = (error: string, status: number) =>
    wantsJson
      ? Response.json({ ok: false, error }, { status })
      : failPage(locale, status >= 500 ? 'send' : 'check', back, status, error);

  // Honeypot. A success, so the bot moves on; logged, in case autofill or a
  // person ever fills it.
  if (clean(form.get('llt-check'))) {
    console.warn('Honeypot filled on', url.pathname);
    return done(sub.next(locale));
  }

  let verified = false;
  if (env.TURNSTILE_SECRET_KEY) {
    const token = clean(form.get('cf-turnstile-response'), 4096);
    verified = await verifyTurnstile(
      token,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get('CF-Connecting-IP'),
    );
    if (!verified) return fail('challenge', 400);
  }

  const data: Data = {};
  for (const key of sub.fields) {
    data[key] = MULTILINE.has(key) ? clean(form.get(key)) : cleanLine(form.get(key));
  }

  if (sub.required.some((key) => !data[key])) return fail('missing', 400);
  if (!isEmail(data.email)) return fail('email', 400);

  // A booking names a plan, and its choices must be that plan's own.
  let booking: Booking | undefined;
  if (sub.booking) {
    const check = checkBooking(data);
    if (!check.ok) return fail(check.problem, 400);
    booking = check.booking;
  }

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set; submission dropped');
    return fail('unconfigured', 500);
  }

  const sent = await sendMail(env, {
    from: env.INQUIRY_FROM ?? 'Website <concierge@losangelesluxurytour.com>',
    to: [env.INQUIRY_TO ?? CONTACT.email],
    // So a reply in the inbox goes straight back to the guest.
    reply_to: data.email,
    subject: sub.subject(data, locale),
    html: emailHtml(sub, data, booking),
  });
  if (!sent) return fail('send', 502);

  // The guest's receipt mails an address typed into a public form, so it goes
  // only where the request is known to come from a person: past the challenge,
  // or behind the preview's password. It is sent after hers, and a receipt
  // that fails does not fail the request: she has it either way.
  if (booking && (verified || env.BETA_PASSWORD)) {
    const mail = receiptMail(booking, locale, url.origin);
    const ok = await sendMail(env, {
      from: 'Los Angeles Luxury Tour <concierge@losangelesluxurytour.com>',
      to: [data.email],
      reply_to: env.INQUIRY_TO ?? CONTACT.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!ok) console.error('Guest receipt not sent for', booking.service);
  }

  return done(booking ? `${sub.next(locale)}?${receivedQuery(booking)}` : sub.next(locale));
}

/** Her received page, with the summary of the request its address carries. */
async function received(request: Request, env: Env, url: URL): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('text/html')) return res;
  const check = checkBooking(Object.fromEntries(url.searchParams));
  if (!check.ok) return res;
  // The page now says what one visitor sent: not one for a cache to keep.
  const headers = new Headers(res.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('Cache-Control', 'no-store');
  if (request.method === 'HEAD') return new Response(null, { status: res.status, headers });
  const locale: Locale = url.pathname.startsWith('/ja/') ? 'ja' : 'en';
  const block = summaryHtml(summary(check.booking, locale));
  // A function, so nothing in the summary is read as a replacement pattern.
  const body = (await res.text()).replace(SUMMARY_MARK, () => block);
  return new Response(body, { status: res.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const beta = env.BETA_PASSWORD;

    if (beta) {
      if (url.pathname === '/api/beta') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }
        const form = await request.formData();
        const next = safeNext(clean(form.get('next'), 512) || '/');
        const given = clean(form.get('password'), 200);
        return given === beta
          ? grantAccess(beta, next)
          : gatePage({ failed: true, next });
      }

      if (!(await hasAccess(request, beta))) {
        return gatePage({ failed: false, next: url.pathname + url.search });
      }
    }

    const submission = SUBMISSIONS[url.pathname];
    if (submission) return handleSubmission(request, env, submission, url);

    const res =
      (request.method === 'GET' || request.method === 'HEAD') &&
      RECEIVED.has(url.pathname) &&
      url.search
        ? await received(request, env, url)
        : await env.ASSETS.fetch(request);
    if (!beta) return res;
    // Nothing behind the gate should ever be indexed.
    const gated = new Response(res.body, res);
    gated.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return gated;
  },
};
