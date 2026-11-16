import { describe, expect, it } from 'vitest';
import { hasAccess, grantAccess, gatePage, safeNext } from '../worker/beta';

const PASSWORD = 'amelia-preview';

const withCookie = (cookie: string) =>
  new Request('https://example.com/', { headers: { Cookie: cookie } });

/** Pull the cookie value back out of a grant response. */
async function tokenFor(password: string): Promise<string> {
  const res = await grantAccess(password, '/');
  const set = res.headers.get('Set-Cookie') ?? '';
  return set.slice(set.indexOf('=') + 1, set.indexOf(';'));
}

describe('access', () => {
  it('lets a correctly signed cookie through', async () => {
    const token = await tokenFor(PASSWORD);
    expect(await hasAccess(withCookie(`lalt_beta=${token}`), PASSWORD)).toBe(true);
  });

  it('turns away a request with no cookie', async () => {
    expect(await hasAccess(new Request('https://example.com/'), PASSWORD)).toBe(false);
  });

  it('turns away a forged cookie', async () => {
    expect(await hasAccess(withCookie('lalt_beta=deadbeef'), PASSWORD)).toBe(false);
  });

  // The cookie is derived from the password, so rotating the password has to
  // invalidate every cookie already issued.
  it('stops accepting old cookies once the password changes', async () => {
    const token = await tokenFor(PASSWORD);
    expect(await hasAccess(withCookie(`lalt_beta=${token}`), 'a-new-password')).toBe(false);
  });

  it('finds its cookie among others', async () => {
    const token = await tokenFor(PASSWORD);
    const req = withCookie(`lalt-theme=light; lalt_beta=${token}; other=1`);
    expect(await hasAccess(req, PASSWORD)).toBe(true);
  });

  it('never puts the password in the cookie', async () => {
    const res = await grantAccess(PASSWORD, '/');
    expect(res.headers.get('Set-Cookie')).not.toContain(PASSWORD);
  });

  it('sets the cookie flags that matter', async () => {
    const set = (await grantAccess(PASSWORD, '/')).headers.get('Set-Cookie') ?? '';
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
      expect(set, flag).toContain(flag);
    }
  });
});

describe('redirect target', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/ja/experience')).toBe('/ja/experience');
  });

  // Otherwise the gate is an open redirect: a link to the site could bounce
  // someone to anywhere once they sign in.
  it('refuses anything that leaves the site', () => {
    expect(safeNext('//evil.example.com')).toBe('/');
    expect(safeNext('https://evil.example.com')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });

  // A browser reads a backslash as a slash and drops a tab or a newline, so
  // each of these leads off the site as // does.
  it('refuses the paths a browser would read as another host', () => {
    for (const raw of ['/\\evil.example/x', '/\t/evil.example/x', '/\n/evil.example', '/\\/evil.example']) {
      expect(safeNext(raw), JSON.stringify(raw)).toBe('/');
    }
    expect(safeNext('/ja/book?service=temecula#form')).toBe('/ja/book?service=temecula#form');
  });

  // The path is resolved twice, here and then by the browser: a dot segment
  // that parses away can leave // at the front, another host to a browser.
  it('refuses a path that resolves to // once its dot segments go', () => {
    for (const raw of ['/..//evil.example', '/.//evil.example', '/%2e%2e//evil.example', '/x/../..//evil.example', '/..//']) {
      expect(safeNext(raw), raw).toBe('/');
    }
    expect(safeNext('/ja/../ja/contact')).toBe('/ja/contact');
  });

  it('sends a redirect back to where they were going', async () => {
    const res = await grantAccess(PASSWORD, '/ja/contact');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/ja/contact');
  });
});

describe('the gate page', () => {
  it('answers 401 so crawlers stay out', () => {
    expect(gatePage({ failed: false, next: '/' }).status).toBe(401);
  });

  it('is marked noindex', () => {
    expect(gatePage({ failed: false, next: '/' }).headers.get('X-Robots-Tag'))
      .toBe('noindex, nofollow');
  });

  it('is never cached', () => {
    expect(gatePage({ failed: false, next: '/' }).headers.get('Cache-Control'))
      .toBe('no-store');
  });

  it('leads in Japanese', async () => {
    const html = await gatePage({ failed: false, next: '/' }).text();
    expect(html).toContain('lang="ja"');
    expect(html).toContain('こちらは公開前のプレビューです。');
  });

  it('says so when the password was wrong', async () => {
    const ok = await gatePage({ failed: false, next: '/' }).text();
    const bad = await gatePage({ failed: true, next: '/' }).text();
    expect(ok).not.toContain('パスワードが違うようです');
    expect(bad).toContain('パスワードが違うようです');
  });

  it('escapes the redirect target into the form', async () => {
    const html = await gatePage({ failed: false, next: '/a"><script>x</script>' }).text();
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  // The field has focus on arrival: it says it is wrong, and points to why.
  it('ties a wrong password to the field it is about', async () => {
    const bad = await gatePage({ failed: true, next: '/' }).text();
    expect(bad).toMatch(/<p class="err" id="gate-err" role="alert">/);
    expect(bad).toMatch(/<input type="password"[^>]*aria-invalid="true" aria-describedby="gate-err"/);
    expect(bad.indexOf('id="gate-err"')).toBeLessThan(bad.indexOf('<form'));
    const ok = await gatePage({ failed: false, next: '/' }).text();
    expect(ok).not.toContain('aria-invalid');
  });

  it('marks its English as English, and shows her icon', async () => {
    const bad = await gatePage({ failed: true, next: '/' }).text();
    expect(bad).toContain('<p class="en" lang="en">This site is not public yet.');
    expect(bad).toContain('<span lang="en">That password did not match.</span>');
    expect(bad).toContain('<link rel="icon" href="/favicon.ico"');
    // The same three as every page, so a home screen has her mark at size.
    expect(bad).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">');
    expect(bad).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  });

  // The two sentences together are wider than the card on most phones and
  // left a character alone on the second line.
  it('gives each sentence of the wrong-password line its own line', async () => {
    const bad = await gatePage({ failed: true, next: '/' }).text();
    expect(bad).toContain('パスワードが違うようです。<br>もう一度お試しください。<br>');
    expect(gatePage({ failed: true, next: '/' }).status).toBe(401);
  });

  // The placeholder is the field's only visible label: the site's floor, not
  // the browser's grey.
  it('draws the placeholder at the site\'s ink', async () => {
    const html = await gatePage({ failed: false, next: '/' }).text();
    expect(html).toMatch(/input::placeholder\s*\{\s*color:\s*rgba\(245,245,250,\.68\);\s*opacity:\s*1;\s*\}/);
  });

  // The site's own floors, on the first screen she sees: 14px for anything
  // on it, 4.5:1 for its text on the black.
  it("meets the site's text sizes and contrast", async () => {
    const html = await gatePage({ failed: true, next: '/' }).text();
    const css = html.match(/<style>([^]*?)<\/style>/)?.[1] ?? '';
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(14);
    // Each light ink is rgba(245,245,250,a) over #101010.
    const lum = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const L = (r: number, g: number, b: number) => 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
    const inks = [...css.matchAll(/rgba\(245,\s*245,\s*250,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(inks.length).toBeGreaterThan(2);
    for (const a of inks) {
      const mix = (fg: number) => Math.round(fg * a + 16 * (1 - a));
      const ratio = (L(mix(245), mix(245), mix(250)) + 0.05) / (L(16, 16, 16) + 0.05);
      expect(ratio, `alpha ${a}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
