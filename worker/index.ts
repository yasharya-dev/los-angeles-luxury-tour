import {
  gatePage,
  grantAccess,
  hasAccess,
  safeNext,
} from './beta';

// Serves the static build and handles POST /api/inquiry.
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

const FIELDS = [
  'name',
  'email',
  'language',
  'guests',
  'dates',
  'hoping',
  'heard',
  'referrer',
] as const;

// Newlines survive; everything else in the control range doesn't.
export function clean(value: FormDataEntryValue | null, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

    if (url.pathname !== '/api/inquiry') {
      const res = await env.ASSETS.fetch(request);
      if (!beta) return res;
      // Nothing behind the gate should ever be indexed.
      const gated = new Response(res.body, res);
      gated.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return gated;
    }

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
    const locale = clean(form.get('locale'), 8) === 'ja' ? 'ja' : 'en';

    // Honeypot. 200 so the bot logs a success and doesn't retry.
    if (clean(form.get('company'))) {
      return wantsJson
        ? Response.json({ ok: true })
        : Response.redirect(new URL(thanksPath(locale), url), 303);
    }

    if (env.TURNSTILE_SECRET_KEY) {
      const token = clean(form.get('cf-turnstile-response'), 4096);
      const ok = await verifyTurnstile(
        token,
        env.TURNSTILE_SECRET_KEY,
        request.headers.get('CF-Connecting-IP'),
      );
      if (!ok) {
        return wantsJson
          ? Response.json({ ok: false, error: 'challenge' }, { status: 400 })
          : new Response('Verification failed', { status: 400 });
      }
    }

    const data: Record<string, string> = {};
    for (const key of FIELDS) data[key] = clean(form.get(key));

    if (!data.name || !data.email || !data.hoping) {
      return wantsJson
        ? Response.json({ ok: false, error: 'missing' }, { status: 400 })
        : new Response('Missing required fields', { status: 400 });
    }

    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set; inquiry dropped');
      return wantsJson
        ? Response.json({ ok: false, error: 'unconfigured' }, { status: 500 })
        : new Response('Mail is not configured', { status: 500 });
    }

    const rows = FIELDS.filter((f) => data[f]).map(
      (f) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#666;vertical-align:top">${f}</td>` +
        `<td style="padding:4px 0">${escapeHtml(data[f]).replace(/\n/g, '<br>')}</td></tr>`,
    );

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
        subject: `Inquiry from ${data.name}${locale === 'ja' ? '（日本語）' : ''}`,
        html: `<table style="font:15px/1.6 system-ui,sans-serif">${rows.join('')}</table>`,
      }),
    });

    if (!send.ok) {
      console.error('Resend failed', send.status, await send.text());
      return wantsJson
        ? Response.json({ ok: false, error: 'send' }, { status: 502 })
        : new Response('Could not send', { status: 502 });
    }

    return wantsJson
      ? Response.json({ ok: true })
      : Response.redirect(new URL(thanksPath(locale), url), 303);
  },
};

export function thanksPath(locale: string): string {
  return locale === 'ja' ? '/ja/thank-you' : '/thank-you';
}
