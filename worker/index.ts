import {
  gatePage,
  grantAccess,
  hasAccess,
  safeNext,
} from './beta';
import { offerings } from '../src/data/offerings';

// Serves the static build and handles the two forms: POST /api/inquiry is the
// consultation form, POST /api/booking is a booking request. Everything about
// handling them is shared; what differs is declared in SUBMISSIONS below.
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
    fields: ['name', 'email', 'line', 'service', 'date', 'guests', 'notes'],
    required: ['name', 'email', 'service', 'date', 'guests'],
    subject: (d, locale) =>
      `Booking request from ${d.name} - ${serviceLabel(d.service)}` +
      jaTag(locale),
    next: receivedPath,
    intro:
      'ご予約リクエストです。空き状況を確認のうえ、通常24時間以内にお客様へご返信ください。 / Booking request: check availability and reply to the guest, normally within 24 hours.',
  },
};

// Newlines survive; everything else in the control range doesn't.
export function clean(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
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

function emailHtml(sub: Submission, data: Data): string {
  const rows = sub.fields
    .filter((f) => data[f])
    .map((f) => {
      const shown = f === 'service' ? serviceLabel(data[f]) : data[f];
      return (
        `<tr><td style="padding:4px 14px 4px 0;color:#666;vertical-align:top">${f}</td>` +
        `<td style="padding:4px 0">${escapeHtml(shown).replace(/\n/g, '<br>')}</td></tr>`
      );
    });
  const intro = sub.intro
    ? `<p style="margin:0 0 14px;color:#444">${escapeHtml(sub.intro)}</p>`
    : '';
  return (
    `<div style="font:15px/1.6 system-ui,sans-serif">${intro}` +
    `<table>${rows.join('')}</table></div>`
  );
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

  const form = await request.formData();
  const wantsJson = (request.headers.get('Accept') ?? '').includes(
    'application/json',
  );
  const locale: Locale = clean(form.get('locale'), 8) === 'ja' ? 'ja' : 'en';
  const done = () =>
    wantsJson
      ? Response.json({ ok: true })
      : Response.redirect(new URL(sub.next(locale), url), 303);
  const fail = (error: string, status: number, text: string) =>
    wantsJson
      ? Response.json({ ok: false, error }, { status })
      : new Response(text, { status });

  // Honeypot. 200 so the bot logs a success and doesn't retry.
  if (clean(form.get('company'))) return done();

  if (env.TURNSTILE_SECRET_KEY) {
    const token = clean(form.get('cf-turnstile-response'), 4096);
    const ok = await verifyTurnstile(
      token,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get('CF-Connecting-IP'),
    );
    if (!ok) return fail('challenge', 400, 'Verification failed');
  }

  const data: Data = {};
  for (const key of sub.fields) data[key] = clean(form.get(key));

  if (sub.required.some((key) => !data[key])) {
    return fail('missing', 400, 'Missing required fields');
  }

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set; submission dropped');
    return fail('unconfigured', 500, 'Mail is not configured');
  }

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.INQUIRY_FROM ?? 'Website <concierge@losangelesluxurytour.com>',
      to: [env.INQUIRY_TO ?? 'losangelesluxurytour@gmail.com'],
      // So a reply in the inbox goes straight back to the guest.
      reply_to: data.email,
      subject: sub.subject(data, locale),
      html: emailHtml(sub, data),
    }),
  });

  if (!send.ok) {
    console.error('Resend failed', send.status, await send.text());
    return fail('send', 502, 'Could not send');
  }

  return done();
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

    const res = await env.ASSETS.fetch(request);
    if (!beta) return res;
    // Nothing behind the gate should ever be indexed.
    const gated = new Response(res.body, res);
    gated.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return gated;
  },
};
