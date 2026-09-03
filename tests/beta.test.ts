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
});
