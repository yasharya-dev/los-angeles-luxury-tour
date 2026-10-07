import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, {
  SUBMISSIONS,
  clean,
  escapeHtml,
  receivedPath,
  serviceLabel,
  thanksPath,
} from '../worker/index';

describe('clean', () => {
  it('trims and returns strings', () => {
    expect(clean('  hi  ')).toBe('hi');
  });

  it('rejects non-strings', () => {
    expect(clean(null)).toBe('');
  });

  it('caps length', () => {
    expect(clean('a'.repeat(5000)).length).toBe(2000);
    expect(clean('abcdef', 3)).toBe('abc');
  });

  // Control characters in a header-adjacent field are how header injection
  // starts, so they are stripped. Newlines are legitimate in the free-text
  // field and survive.
  it('strips control characters but keeps newlines and tabs', () => {
    expect(clean('a' + String.fromCharCode(0) + 'bc')).toBe('abc');
    expect(clean('a\nb\tc')).toBe('a\nb\tc');
    expect(clean('a' + String.fromCharCode(0x7f) + 'b')).toBe('ab');
  });
});

describe('escapeHtml', () => {
  it('escapes the four dangerous characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes the ampersand first, so entities are not double-broken', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves Japanese untouched', () => {
    expect(escapeHtml('完全予約制')).toBe('完全予約制');
  });
});

describe('thanksPath', () => {
  it('mirrors the site routes', () => {
    expect(thanksPath('ja')).toBe('/ja/thank-you');
    expect(thanksPath('en')).toBe('/thank-you');
  });

  it('falls back to English for anything unexpected', () => {
    expect(thanksPath('fr')).toBe('/thank-you');
    expect(thanksPath('')).toBe('/thank-you');
  });
});

describe('receivedPath', () => {
  it('mirrors the site routes', () => {
    expect(receivedPath('ja')).toBe('/ja/book/received');
    expect(receivedPath('en')).toBe('/book/received');
    expect(receivedPath('')).toBe('/book/received');
  });
});

describe('SUBMISSIONS', () => {
  it('handles exactly the two forms', () => {
    expect(Object.keys(SUBMISSIONS).sort()).toEqual([
      '/api/booking',
      '/api/inquiry',
    ]);
  });

  // A booking without a plan, a date or a party size is not a booking.
  it('refuses a booking without plan, date and guests', () => {
    expect(SUBMISSIONS['/api/booking'].required).toEqual([
      'name',
      'email',
      'service',
      'date',
      'guests',
    ]);
  });

  it('says what the email is, in the subject, in both languages', () => {
    const d = { name: 'Nao', service: 'temecula' };
    expect(SUBMISSIONS['/api/booking'].subject(d, 'ja')).toBe(
      'Booking request from Nao - テメキュラ ワイナリー1日旅 / Temecula winery day（日本語）',
    );
    expect(SUBMISSIONS['/api/inquiry'].subject({ name: 'Nao' }, 'en')).toBe(
      'Inquiry from Nao',
    );
  });

  it('tells her a booking is a request to act on', () => {
    expect(SUBMISSIONS['/api/booking'].intro).toMatch(/通常24時間以内/);
    expect(SUBMISSIONS['/api/inquiry'].intro).toBeUndefined();
  });
});

describe('the Worker, end to end', () => {
  const env = (over: Record<string, unknown> = {}) =>
    ({
      ASSETS: { fetch: async () => new Response('asset') },
      ...over,
    }) as never;

  const post = (
    path: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ) =>
    worker.fetch(
      new Request(`https://x.test${path}`, {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers,
        },
      }),
      env({ RESEND_API_KEY: 're_test' }),
    );

  const booking = {
    locale: 'ja',
    name: 'Nao',
    email: 'nao@example.com',
    service: 'temecula',
    date: '2027-01-05',
    guests: '5名様',
  };

  afterEach(() => vi.unstubAllGlobals());

  it('serves anything that is not a form from the assets binding', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/ja/book'),
      env(),
    );
    expect(await res.text()).toBe('asset');
  });

  it('only accepts POST on the form endpoints', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/booking'),
      env(),
    );
    expect(res.status).toBe(405);
  });

  it('refuses a booking missing a required field', async () => {
    const { date: _date, ...noDate } = booking;
    const res = await post('/api/booking', noDate, {
      Accept: 'application/json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'missing' });
  });

  it('pretends to accept the honeypot, and lands on the received page', async () => {
    const res = await post('/api/booking', { ...booking, company: 'bot' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(
      'https://x.test/ja/book/received',
    );
  });

  it('sends a booking request through Resend and lands on the received page', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }),
    );

    const res = await post('/api/booking', booking);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(
      'https://x.test/ja/book/received',
    );

    const mail = sent[0] as Record<string, string>;
    expect(mail.subject).toBe(
      'Booking request from Nao - テメキュラ ワイナリー1日旅 / Temecula winery day（日本語）',
    );
    expect(mail.reply_to).toBe('nao@example.com');
    expect(mail.html).toContain('2027-01-05');
    expect(mail.html).toContain('通常24時間以内');
  });

  it('still lands an inquiry on the thank-you page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const res = await post('/api/inquiry', {
      locale: 'en',
      name: 'Nao',
      email: 'nao@example.com',
      hoping: 'A good trip',
    });
    expect(res.headers.get('Location')).toBe('https://x.test/thank-you');
  });
});

describe('serviceLabel', () => {
  // She reads the email in Japanese; the id is ours.
  it('shows a known plan in both languages', () => {
    expect(serviceLabel('temecula')).toBe(
      'テメキュラ ワイナリー1日旅 / Temecula winery day',
    );
  });

  it('passes an unknown value through rather than dropping it', () => {
    expect(serviceLabel('something-else')).toBe('something-else');
  });
});
