import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, {
  SUBMISSIONS,
  clean,
  cleanLine,
  escapeHtml,
  isEmail,
  receivedPath,
  serviceLabel,
  thanksPath,
} from '../worker/index';
import { SUMMARY_MARK } from '../src/data/booking';
import { MAIL_DEADLINE, SEND_DEADLINE } from '../src/data/deadlines';
import { grantAccess } from '../worker/beta';

// The Worker refuses a booking before today in Los Angeles, and the fixtures
// are dated 2027: the clock is pinned to the day these were written, so the
// suite, and npm run deploy with it, does not start failing as they pass.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T20:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

// The Workers runtime reads every named export of the Worker's module as an
// entrypoint, and will not start if one is not a function or an object: an
// exported number stopped wrangler dev cold, and would have failed the
// deploy, though every test here passed in node.
describe('the module the runtime loads', () => {
  it('exports nothing the Workers runtime cannot load as an entrypoint', async () => {
    const mod = await import('../worker/index');
    for (const [name, value] of Object.entries(mod)) {
      expect(['function', 'object'], name).toContain(typeof value);
      expect(value, name).not.toBeNull();
    }
  });
});

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

describe('cleanLine and isEmail', () => {
  it('folds every line break in a one-line field into a space', () => {
    expect(cleanLine('Nao\r\nBcc: x@y.test')).toBe('Nao Bcc: x@y.test');
  });

  it('takes one address, and only an address', () => {
    expect(isEmail('nao@example.co.jp')).toBe(true);
    for (const bad of ['nao', 'a@b', 'a@b.c', 'a@b.test, c@d.test', 'Nao <nao@example.com>', 'a b@c.test']) {
      expect(isEmail(bad), bad).toBe(false);
    }
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
      'service',
      'date',
      'guests',
      'name',
      'email',
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
    guests: '5',
  };

  afterEach(() => vi.unstubAllGlobals());

  it('serves anything that is not a form from the assets binding', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/ja/book'),
      env(),
    );
    expect(await res.text()).toBe('asset');
  });

  // Counted as it arrives: a stream that never ends must be refused at the
  // cap, which reading it whole first would never reach. And a body of
  // exactly 64 KB is still a form.
  it('refuses an endless body at the cap, and takes one of exactly 64 KB', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const endless = new ReadableStream({
      pull(c) {
        c.enqueue(chunk);
      },
    });
    const send = (body: BodyInit) =>
      worker.fetch(
        new Request('https://x.test/api/booking', {
          method: 'POST',
          body,
          duplex: 'half',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        } as RequestInit),
        env({ RESEND_API_KEY: 're_test' }),
      );
    expect((await send(endless)).status).toBe(413);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const base = new URLSearchParams(booking).toString() + '&notes=';
    const exact = base + 'x'.repeat(64 * 1024 - base.length);
    expect(exact.length).toBe(64 * 1024);
    const ok = await send(exact);
    expect(ok.status).toBe(200);
    expect((await send(exact + 'x')).status).toBe(413);
  });

  // A connection that drops mid-upload: a bad request, not an uncaught error.
  it('answers a body that breaks off with a bad request', async () => {
    const broken = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('locale=ja&name='));
        c.error(new Error('connection reset'));
      },
    });
    const res = await worker.fetch(
      new Request('https://x.test/api/booking', {
        method: 'POST',
        body: broken,
        duplex: 'half',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      } as RequestInit),
      env({ RESEND_API_KEY: 're_test' }),
    );
    expect(res.status).toBe(400);
  });

  // The form's own cap, 64 KB, for a body sent in chunks with no length:
  // read as it arrives, not in full first.
  it('holds a body sent without a length to the same cap, and reads a small one', async () => {
    const stream = (text: string) =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(text));
          c.close();
        },
      });
    const send = (text: string) =>
      worker.fetch(
        new Request('https://x.test/api/booking', {
          method: 'POST',
          body: stream(text),
          duplex: 'half',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        } as RequestInit),
        env({ RESEND_API_KEY: 're_test' }),
      );
    const big = new URLSearchParams({ ...booking, notes: 'x'.repeat(70 * 1024) }).toString();
    expect((await send(big)).status).toBe(413);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const small = await send(new URLSearchParams(booking).toString());
    expect(small.status).toBe(200);
    expect(((await small.json()) as { ok?: boolean }).ok).toBe(true);
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
    const res = await post('/api/booking', { ...booking, 'llt-check': 'bot' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(
      'https://x.test/ja/book/received',
    );
  });

  // A mail service that never answers would hold the guest's request open
  // past the form's own deadline. Past ours the send has failed: 502, and
  // the form shows the address to write to.
  it('gives up on a mail service that does not answer, in time for the form', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-11-15T20:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    );
    const answer = post('/api/booking', booking, { Accept: 'application/json' });
    await vi.advanceTimersByTimeAsync(MAIL_DEADLINE);
    const res = await answer;
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'send' });
    expect(MAIL_DEADLINE * 2).toBeLessThan(SEND_DEADLINE);
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
      'https://x.test/ja/book/received?service=temecula&date=2027-01-05&guests=5',
    );

    const mail = sent[0] as Record<string, string>;
    expect(mail.subject).toBe(
      'Booking request from Nao - テメキュラ ワイナリー1日旅 / Temecula winery day（日本語）',
    );
    expect(mail.reply_to).toBe('nao@example.com');
    expect(mail.html).toContain('2027年1月5日（火）');
    expect(mail.html).toContain('通常24時間以内');
  });

  it('takes a post from its own site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = await post('/api/booking', transfer, { ...json, Origin: 'https://x.test' });
    expect(res.status).toBe(200);
  });

  it('refuses a past date, a body that is not a form, and one too big for a form', async () => {
    const past = await post('/api/booking', { ...transfer, date: '2001-01-01' }, json);
    expect(await past.json()).toEqual({ ok: false, error: 'date' });
    const notForm = await worker.fetch(
      new Request('https://x.test/api/booking', { method: 'POST', body: '{}' }),
      env({ RESEND_API_KEY: 're_test' }),
    );
    expect(notForm.status).toBe(400);
    const huge = await worker.fetch(
      new Request('https://x.test/api/booking', {
        method: 'POST',
        body: 'x',
        headers: { 'Content-Length': String(1024 * 1024) },
      }),
      env({ RESEND_API_KEY: 're_test' }),
    );
    expect(huge.status).toBe(413);
  });

  it('tells a visitor without script what was wrong, with a way back that keeps their typing', async () => {
    const res = await post('/api/booking', { ...transfer, route: '' }, { Referer: 'https://x.test/ja/book/dodgers-transfer' });
    const body = await res.text();
    expect(res.status).toBe(400);
    expect(body).toContain('送迎区間を選択してください。');
    // A fold after each stop: under keep-all Safari has none of its own.
    expect(body).toContain('送信できませんでした。<wbr>前のページに戻り、<wbr>入力内容をご確認ください。</p>');
    expect(body).toContain('href="/ja/book/dodgers-transfer" onclick="history.back();return false"');
  });

  // A send that fails is not the guest's fault: the page says so and hands
  // over the address, straight after the Japanese colon, after a space in
  // English, the space being the copy's.
  it('gives a visitor without script the address when a send fails, in each language', async () => {
    const unsent = (fields: Record<string, string>) =>
      worker.fetch(
        new Request('https://x.test/api/booking', {
          method: 'POST',
          body: new URLSearchParams(fields),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
        env(),
      );
    const ja = await unsent({ ...transfer, locale: 'ja' });
    expect(ja.status).toBe(500);
    expect(await ja.text()).toContain('ご連絡ください：<wbr><a href="mailto:losangelesluxurytour@gmail.com">');
    const en = await unsent({ ...transfer, locale: 'en' });
    expect(await en.text()).toContain('directly at <a href="mailto:losangelesluxurytour@gmail.com">');
  });

  it('sends the consultation on to the thank-you page too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = await post(
      '/api/inquiry',
      { locale: 'ja', name: 'Nao', email: 'nao@example.com', hoping: 'A good trip' },
      json,
    );
    expect(await res.json()).toEqual({ ok: true, next: '/ja/thank-you' });
  });

  // Behind the preview's password, the only receipts that go out today.
  it('sends the receipt behind the preview password', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }),
    );
    const granted = await grantAccess('pw', '/');
    const cookie = (granted.headers.get('Set-Cookie') ?? '').split(';')[0];
    const res = await worker.fetch(
      new Request('https://x.test/api/booking', {
        method: 'POST',
        body: new URLSearchParams(transfer),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, ...json },
      }),
      env({ RESEND_API_KEY: 're_test', BETA_PASSWORD: 'pw' }),
    );
    expect(res.status).toBe(200);
    expect(sent.length).toBe(2);
  });

  it('fills the English page in English, and keeps the filled page out of caches', async () => {
    const page = `<main>${SUMMARY_MARK}</main>`;
    const assets = {
      fetch: async () =>
        new Response(page, { headers: { 'Content-Type': 'text/html', ETag: '"abc"' } }),
    };
    const q = 'service=dodgers-transfer&type=round-trip&date=2027-04-10&guests=over';
    const res = await worker.fetch(new Request(`https://x.test/book/received?${q}`), env({ ASSETS: assets }));
    const text = await res.text();
    expect(text).toContain('Your request');
    expect(text).toContain('Round trip');
    expect(text).toContain('Saturday, April 10, 2027');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('ETag')).toBeNull();
    const head = await worker.fetch(
      new Request(`https://x.test/book/received?${q}`, { method: 'HEAD' }),
      env({ ASSETS: assets }),
    );
    expect(head.headers.get('Cache-Control')).toBe('no-store');
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

  // Her plan in her format: the choices posted must be the plan's own.
  const transfer = {
    locale: 'ja',
    name: 'Nao',
    email: 'nao@example.com',
    service: 'dodgers-transfer',
    type: 'one-way',
    route: 'to-stadium',
    date: '2027-04-10',
    guests: '2',
  };
  const json = { Accept: 'application/json' };

  it('refuses a choice the plan does not have, and a one-way without its route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const { type: _t, ...noType } = transfer;
    for (const [fields, error] of [
      [noType, 'type'],
      [{ ...transfer, type: 'helicopter' }, 'type'],
      [{ ...transfer, route: '' }, 'route'],
      [{ ...transfer, guests: '9' }, 'guests'],
      [{ ...transfer, date: '2027-02-30' }, 'date'],
      [{ ...transfer, service: 'nope' }, 'service'],
      [{ ...transfer, email: 'a@b.test, c@d.test' }, 'email'],
    ] as const) {
      const res = await post('/api/booking', fields, json);
      expect(res.status, error).toBe(400);
      expect(await res.json(), error).toEqual({ ok: false, error });
    }
  });

  it('drops a route from a round trip, and names the received page with what was checked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = await post('/api/booking', { ...transfer, type: 'round-trip' }, json);
    expect(await res.json()).toEqual({
      ok: true,
      next: '/ja/book/received?service=dodgers-transfer&type=round-trip&date=2027-04-10&guests=2',
    });
  });

  it('refuses a post from another site', async () => {
    const res = await post('/api/booking', transfer, { Origin: 'https://elsewhere.test' });
    expect(res.status).toBe(403);
  });

  it('keeps a one-line field on one line, so nothing reaches the subject', async () => {
    const sent: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }),
    );
    await post('/api/booking', { ...transfer, name: 'Nao\r\nBcc: x@y.test' }, json);
    expect(sent[0].subject).not.toMatch(/[\r\n]/);
  });

  // The receipt mails an address typed into a public form: only past the
  // challenge (or behind the preview's password), and only what the plan's
  // data vouches for.
  const withChallenge = (resend: (body: Record<string, unknown>) => Response) => {
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).includes('turnstile')) return Response.json({ success: true });
        const body = JSON.parse(String(init.body));
        sent.push(body);
        return resend(body);
      }),
    );
    return sent;
  };
  const postVerified = (fields: Record<string, string>) =>
    worker.fetch(
      new Request('https://x.test/api/booking', {
        method: 'POST',
        body: new URLSearchParams({ ...fields, 'cf-turnstile-response': 'ok' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...json },
      }),
      env({ RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'secret' }),
    );

  it('sends her the whole request, then the guest her receipt', async () => {
    const sent = withChallenge(() => new Response('{}', { status: 200 }));
    const res = await postVerified({ ...transfer, hotel: 'The Hotel', notes: 'A wheelchair' });
    expect(res.status).toBe(200);
    expect(sent.length).toBe(2);
    const [hers, guests] = sent as Record<string, string>[];
    expect(hers.html).toContain('The Hotel');
    expect(hers.html).toContain('A wheelchair');
    expect(hers.html).toContain('片道送迎 / One way');
    expect(guests.to).toEqual(['nao@example.com']);
    expect(guests.subject).toBe('【Los Angeles Luxury Tour】ご予約リクエスト受付完了');
    expect(guests.html).toContain('なお、この時点ではご予約は確定しておりません。');
    expect(guests.html).toContain('ホテル → スタジアム');
    expect(guests.html).toContain('2027年4月10日（土）');
    // Nothing the guest typed is relayed to the address they typed.
    for (const typed of ['Nao', 'The Hotel', 'A wheelchair']) {
      expect(guests.html, typed).not.toContain(typed);
      expect(guests.text, typed).not.toContain(typed);
    }
  });

  it('sends no receipt from the open site without the challenge', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }),
    );
    await post('/api/booking', transfer, json);
    expect(sent.length).toBe(1);
  });

  it('does not fail the request when only the receipt fails', async () => {
    const sent = withChallenge((body) =>
      new Response('{}', { status: (body.to as string[])[0] === 'nao@example.com' ? 500 : 200 }),
    );
    const res = await postVerified(transfer);
    expect(sent.length).toBe(2);
    expect(res.status).toBe(200);
  });

  it('fills the received page with what was checked, and only that', async () => {
    const page = `<main><h1>x</h1>${SUMMARY_MARK}</main>`;
    const assets = {
      fetch: async () => new Response(page, { headers: { 'Content-Type': 'text/html' } }),
    };
    const get = (q: string) =>
      worker.fetch(new Request(`https://x.test/ja/book/received?${q}`), env({ ASSETS: assets }));
    const filled = await (await get('service=dodgers-transfer&type=one-way&route=to-hotel&date=2027-04-10&guests=over')).text();
    expect(filled).toContain('お申し込み内容');
    expect(filled).toContain('スタジアム → ホテル');
    expect(filled).toContain('5名様以上（要相談）');
    expect(filled).not.toContain(SUMMARY_MARK);
    const refused = await (await get('service=dodgers-transfer&type=one-way&date=2027-04-10&guests=2&name=<b>x</b>')).text();
    expect(refused).toBe(page);
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

describe('what every response carries', () => {
  const asset = (status = 200) =>
    ({
      ASSETS: {
        fetch: async () =>
          new Response('asset', { status, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } }),
      },
    }) as never;

  // A file under /_astro/ is named by a hash of its content.
  it('keeps a hashed file for a year, and nothing else', async () => {
    const hashed = await worker.fetch(new Request('https://x.test/_astro/Base.D2ezkrIy.css'), asset());
    expect(hashed.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const page = await worker.fetch(new Request('https://x.test/ja/about'), asset());
    expect(page.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    const gone = await worker.fetch(new Request('https://x.test/_astro/gone.css'), asset(404));
    expect(gone.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
  });

  it('cannot be framed by another site, and is never sniffed', async () => {
    for (const path of ['/', '/ja/book/dodgers-transfer', '/api/booking', '/_astro/x.js']) {
      const res = await worker.fetch(new Request(`https://x.test${path}`), asset());
      expect(res.headers.get('X-Frame-Options'), path).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy'), path).toBe("frame-ancestors 'none'");
      expect(res.headers.get('X-Content-Type-Options'), path).toBe('nosniff');
      expect(res.headers.get('Referrer-Policy'), path).toBe('strict-origin-when-cross-origin');
    }
  });
});

describe('the preview gate, through the Worker', () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') }, BETA_PASSWORD: 'pw' } as never;

  // After a wrong password the address bar shows /api/beta; reopened, that
  // was a bare 405.
  it('sends the address of the login back to the gate', async () => {
    const res = await worker.fetch(new Request('https://x.test/api/beta'), env);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://x.test/');
  });

  it('answers a body that is not a form with the gate, not an error', async () => {
    for (const [type, body] of [
      ['application/json', '{"password":"pw"}'],
      ['text/plain', 'pw'],
    ]) {
      const res = await worker.fetch(
        new Request('https://x.test/api/beta', { method: 'POST', body, headers: { 'Content-Type': type } }),
        env,
      );
      expect(res.status, type).toBe(401);
      expect(await res.text(), type).toContain('パスワードが違うようです');
    }
  });

  it('lets the right password through, to a path on this site only', async () => {
    const login = (next: string) =>
      worker.fetch(
        new Request('https://x.test/api/beta', {
          method: 'POST',
          body: new URLSearchParams({ password: 'pw', next }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
        env,
      );
    const granted = await login('/ja/contact');
    expect(granted.headers.get('Location')).toBe('/ja/contact');
    // Through every header the Worker adds, the cookie is still there.
    expect(granted.headers.get('Set-Cookie')).toMatch(/^lalt_beta=/);
    expect(granted.headers.get('X-Frame-Options')).toBe('DENY');
    expect((await login('/..//evil.example')).headers.get('Location')).toBe('/');
    expect((await login('/\\evil.example/x')).headers.get('Location')).toBe('/');
    expect((await login('/\t/evil.example/x')).headers.get('Location')).toBe('/');
  });
});

// What the review of the caching and gate work found.
describe('the gate and the cache, after review', () => {
  const gated = (over: Record<string, unknown> = {}) =>
    ({
      ASSETS: {
        fetch: async (req: Request) =>
          new URL(req.url).pathname === '/_astro/x.css' && req.headers.get('If-None-Match')
            ? new Response(null, { status: 304 })
            : new Response('asset', { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } }),
      },
      BETA_PASSWORD: 'pw',
      ...over,
    }) as never;
  const cookie = async () => ((await grantAccess('pw', '/')).headers.get('Set-Cookie') ?? '').split(';')[0];

  // Her mark, from the first screen on: the gate answered it with its page.
  it('serves the icons before the gate', async () => {
    for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/icon-192.png']) {
      const res = await worker.fetch(new Request(`https://x.test${path}`), gated());
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe('asset');
    }
  });

  // Behind the gate a hashed file is the visitor's to keep, not a shared
  // cache's; without the cookie it is the gate, kept by no one.
  it('keeps the preview\'s files private, and never the gate itself', async () => {
    const withCookie = { headers: { Cookie: await cookie() } };
    const kept = await worker.fetch(new Request('https://x.test/_astro/Base.css', withCookie), gated());
    expect(kept.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    const again = await worker.fetch(
      new Request('https://x.test/_astro/x.css', { headers: { ...withCookie.headers, 'If-None-Match': '"a"' } }),
      gated(),
    );
    expect(again.status).toBe(304);
    expect(again.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    const gate = await worker.fetch(new Request('https://x.test/_astro/Base.css'), gated());
    expect(gate.status).toBe(401);
    expect(gate.headers.get('Cache-Control')).toBe('no-store');
  });

  // A sign-in from another site's page is refused, as the forms' posts are.
  it('refuses a sign-in posted from another site', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/beta', {
        method: 'POST',
        body: new URLSearchParams({ password: 'pw', next: '/' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
      }),
      gated(),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  // A form sent once the cookie has run out meets the gate. After signing
  // in, the visitor goes back to the form's page, not to a bare 405.
  it('sends a caught form post back to its own page after signing in', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/booking', {
        method: 'POST',
        body: new URLSearchParams({ locale: 'ja' }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://x.test/ja/book/dodgers-transfer',
        },
      }),
      gated(),
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('name="next" value="/ja/book/dodgers-transfer"');
    const elsewhere = await worker.fetch(
      new Request('https://x.test/api/inquiry', { method: 'POST', headers: { Referer: 'https://evil.example/x' } }),
      gated(),
    );
    expect(await elsewhere.text()).toContain('name="next" value="/"');
  });
});

// What the end-to-end test of the caching and gate work found.
describe('the Worker, after the end-to-end test', () => {
  /** A file server that records what it was asked, and answers a condition
      with 304 as the real one does. */
  const files = () => {
    const asked: Request[] = [];
    const env = {
      ASSETS: {
        fetch: async (req: Request) => {
          asked.push(req);
          if (req.headers.get('If-None-Match')) return new Response(null, { status: 304 });
          return new Response('<h1>Page not found</h1>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"p"' },
          });
        },
      },
    };
    return { asked, env: env as never };
  };

  // Their language link points at the other one by name, and a crawler
  // following it found a page that says nothing is here, answering 200.
  it('answers its not-found pages with 404, by name too', async () => {
    for (const path of ['/404', '/ja/404']) {
      const { env } = files();
      const res = await worker.fetch(new Request(`https://x.test${path}`), env);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).toContain('Page not found');
      expect(res.headers.get('X-Frame-Options'), path).toBe('DENY');
    }
    const { env } = files();
    const head = await worker.fetch(new Request('https://x.test/404', { method: 'HEAD' }), env);
    expect(head.status).toBe(404);
    // A browser that kept the page asks again with its ETag: still the page.
    const again = await worker.fetch(new Request('https://x.test/ja/404', { headers: { 'If-None-Match': '"p"' } }), env);
    expect(again.status).toBe(404);
    expect(await again.text()).toContain('Page not found');
    // Other pages are untouched.
    expect((await worker.fetch(new Request('https://x.test/ja/4040'), env)).status).toBe(200);
  });

  // Bots post to pages all day. The file server answers 405 without reading
  // the body, and the runtime failed reading it afterwards: wrangler dev
  // stopped on one.
  it('turns away a body sent to a page without handing it to the files', async () => {
    for (const path of ['/ja/contact', '/', '/api/beta', '/favicon.ico', '/_astro/x.css']) {
      const { asked, env } = files();
      const req = new Request(`https://x.test${path}`, { method: 'POST', body: 'password=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const res = await worker.fetch(req, env);
      expect(res.status, path).toBe(405);
      expect(res.headers.get('Allow'), path).toBe('GET, HEAD');
      expect(res.headers.get('X-Frame-Options'), path).toBe('DENY');
      expect(asked.length, path).toBe(0);
    }
  });

  // Behind the gate an icon is served before it, for reading only: a post to
  // one meets the gate like any other.
  it('serves the icons before the gate to a read only', async () => {
    const { asked, env } = files();
    const gated = { ...(env as object), BETA_PASSWORD: 'pw' } as never;
    const res = await worker.fetch(new Request('https://x.test/favicon.ico', { method: 'POST', body: 'x' }), gated);
    expect(res.status).toBe(401);
    // Signed in, a post to a page is turned away by the Worker as well.
    const cookie = ((await grantAccess('pw', '/')).headers.get('Set-Cookie') ?? '').split(';')[0];
    const signedIn = await worker.fetch(
      new Request('https://x.test/ja/contact', { method: 'POST', body: 'x', headers: { Cookie: cookie } }),
      gated,
    );
    expect(signedIn.status).toBe(405);
    expect(asked.length).toBe(0);
  });
});
