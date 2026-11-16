// Shared-password gate for the client preview.
//
// Controlled entirely by the BETA_PASSWORD secret. No secret, no gate, so
// production behaviour is the default and the beta is the exception. Going
// live is `wrangler secret delete BETA_PASSWORD`, not a code change.

const COOKIE = 'lalt_beta';
const CLAIM = 'beta-ok';
const MAX_AGE = 60 * 60 * 24 * 30;

/** HMAC of a fixed claim, keyed by the password. Forging it needs the password. */
async function sign(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(CLAIM),
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Length-independent compare, so timing does not leak the token. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(header: string | null, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

export async function hasAccess(
  request: Request,
  password: string,
): Promise<boolean> {
  const token = readCookie(request.headers.get('Cookie'), COOKIE);
  if (!token) return false;
  return safeEqual(token, await sign(password));
}

export async function grantAccess(
  password: string,
  redirectTo: string,
): Promise<Response> {
  const token = await sign(password);
  return new Response(null, {
    status: 303,
    headers: {
      Location: redirectTo,
      'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * The gate. Japanese first, because Amelia reads Japanese and this is the
 * first screen she sees. Inline styles because it must render before any of
 * the site's own CSS is reachable.
 */
export function gatePage(opts: { failed: boolean; next: string }): Response {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Los Angeles Luxury Tour</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh; display: grid; place-items: center;
    padding: 24px; background: #101010; color: #f5f5fa;
    font-family: "Noto Serif JP", Georgia, serif;
  }
  .card { width: 100%; max-width: 380px; text-align: center; }
  .mark {
    font-family: Georgia, serif; font-size: 30px; letter-spacing: .18em;
    color: #d4af37; margin-bottom: 6px;
  }
  /* The site's own floors: 16px to read, 14px for a label, 4.5:1 for text
     and 3:1 for a field's edge. */
  .sub {
    font-size: 14px; letter-spacing: .2em; color: rgba(245,245,250,.68);
    text-transform: uppercase; margin-bottom: 40px;
  }
  h1 { font-size: 16px; font-weight: 500; line-height: 2; margin: 0 0 8px; }
  .en { font-size: 14px; line-height: 1.7; color: rgba(245,245,250,.68); margin: 0 0 28px; }
  input {
    width: 100%; padding: 13px 14px; background: #181818; color: #f5f5fa;
    border: 1px solid rgba(212,175,55,.6); border-radius: 0; font-size: 16px;
    font-family: inherit; text-align: center; letter-spacing: .08em;
  }
  input:focus-visible { outline: 2px solid #d4af37; outline-offset: 2px; border-color: #d4af37; }
  button {
    width: 100%; margin-top: 14px; padding: 13px; background: none;
    color: #d4af37; border: 1px solid rgba(212,175,55,.55); border-radius: 0;
    font-family: inherit; font-size: 14px; letter-spacing: .2em; cursor: pointer;
    transition: background .3s ease, color .3s ease;
  }
  button:hover { background: rgba(212,175,55,.1); color: #f5f5fa; }
  button:focus-visible { outline: 2px solid #d4af37; outline-offset: 2px; }
  .err { margin: 18px 0 0; font-size: 14px; color: #e8996b; line-height: 1.7; }
  .foot { margin-top: 40px; font-size: 14px; color: rgba(245,245,250,.68); line-height: 1.8; }
</style>
</head>
<body>
  <main class="card">
    <div class="mark">LA</div>
    <div class="sub">Los Angeles Luxury Tour</div>
    <h1>こちらは公開前のプレビューです。</h1>
    <p class="en" lang="en">This site is not public yet. Please enter the password.</p>
    <form method="POST" action="/api/beta">
      <input type="hidden" name="next" value="${escapeAttr(opts.next)}">
      <input type="password" name="password" placeholder="パスワード"
             autocomplete="current-password" autofocus aria-label="パスワード">
      <button type="submit">確認する</button>
    </form>
    ${opts.failed ? '<p class="err" role="alert">パスワードが違うようです。もう一度お試しください。<br><span lang="en">That password did not match.</span></p>' : ''}
    <p class="foot">ご不明な点は Yash までご連絡ください。</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    // 401 keeps crawlers out even if the URL leaks.
    status: opts.failed ? 401 : 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Only a path on this site, so the gate cannot be used as an open redirect.
 * A browser reads a backslash as a slash and drops a tab or a newline, so
 * /\evil.example and /<tab>/evil.example lead off the site as // does: the
 * path is resolved the way a browser would, and must stay on this origin.
 */
export function safeNext(raw: string): string {
  if (!raw.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(raw)) return '/';
  try {
    const base = 'https://gate.invalid';
    const url = new URL(raw, base);
    return url.origin === base ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}
