// Runs against dist/, so `npm run build` has to have happened first.
// `npm test` chains them.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { offerings } from '../src/data/offerings';
import { journeys } from '../src/data/journeys';
import { plans } from '../src/data/plans';

const DIST = join(process.cwd(), 'dist');

const PATHS = [
  '/',
  '/experience',
  ...journeys.map((j) => `/experience/${j.slug}`),
  ...plans.map((plan) => `/experience/${plan.slug}`),
  '/about',
  '/contact',
  '/book',
  '/consult',
  '/privacy',
  '/thank-you',
  '/book/received',
];

// Form destinations, not pages anyone should land on from search.
const NOT_IN_SITEMAP = ['/thank-you', '/book/received'];

// build.format is 'file': /about is about.html and /ja is ja.html. Only the
// site root is an index.html.
const distFile = (route: string) => {
  const bare = route.replace(/\/$/, '');
  return join(DIST, bare === '' ? 'index.html' : `${bare}.html`);
};

const html = (route: string) => readFileSync(distFile(route), 'utf8');

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

beforeAll(() => {
  if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first.');
  }
});

describe('routes', () => {
  it('builds every page in both locales', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        const route = prefix + p;
        expect(existsSync(distFile(route)), route).toBe(true);
      }
    }
  });

  it('builds 404, sitemap and robots', () => {
    expect(existsSync(join(DIST, '404.html'))).toBe(true);
    // 404-page mode walks up looking for this exact name, so the Japanese
    // page has to be here and not at ja/404/index.html.
    expect(existsSync(join(DIST, 'ja', '404.html'))).toBe(true);
    expect(existsSync(join(DIST, 'sitemap.xml'))).toBe(true);
    expect(existsSync(join(DIST, 'robots.txt'))).toBe(true);
  });

  // Every page declares summary_large_image, so every page needs the image.
  it('gives every page a share image that exists', () => {
    expect(existsSync(join(DIST, 'og', 'default.jpg'))).toBe(true);
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        const doc = html(prefix + p);
        expect(doc, `${prefix}${p}`).toContain(
          'property="og:image" content="https://losangelesluxurytour.com/og/default.jpg"',
        );
        expect(doc, `${prefix}${p} twitter`).toContain('name="twitter:image"');
      }
    }
  });

  it('never ships the env example', () => {
    expect(existsSync(join(DIST, '.env.example'))).toBe(false);
  });
});

describe('locale correctness', () => {
  it('sets lang on every page', () => {
    for (const p of PATHS) {
      expect(html(p), `en ${p}`).toContain('<html lang="en"');
      expect(html('/ja' + p), `ja ${p}`).toContain('<html lang="ja"');
    }
  });

  // Every URL a page derives from "the page I am on", checked by value. An
  // earlier version of these only asserted that a hreflang attribute existed,
  // and passed for months while the build was writing /ja.html into all of
  // them: the canonical, the alternates and the language link.
  const SITE = 'https://losangelesluxurytour.com';
  const routes = PATHS.map((p) => ({ en: p, ja: p === '/' ? '/ja' : `/ja${p}` }));

  it('gives every page a canonical and og:url that are its own public URL', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const doc = html(route);
        expect(doc, route).toContain(`<link rel="canonical" href="${SITE}${route}">`);
        expect(doc, route).toContain(`<meta property="og:url" content="${SITE}${route}">`);
      }
    }
  });

  it('declares reciprocal hreflang alternates that point at real pages', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const doc = html(route);
        expect(doc, `${route} en`).toContain(`hreflang="en" href="${SITE}${pair.en}"`);
        expect(doc, `${route} ja`).toContain(`hreflang="ja" href="${SITE}${pair.ja}"`);
        expect(doc, `${route} x-default`).toContain(`hreflang="x-default" href="${SITE}${pair.en}"`);
      }
    }
  });

  // The canonical of a page and its sitemap entry are the same string.
  it('agrees with the sitemap', () => {
    const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    for (const pair of routes) {
      if (NOT_IN_SITEMAP.includes(pair.en)) continue;
      for (const route of [pair.en, pair.ja]) {
        expect(xml, route).toContain(`<loc>${SITE}${route}</loc>`);
      }
    }
  });

  // On the Japanese home this link used to lead back to the Japanese home.
  it('sends every language link to the same page in the other language', () => {
    for (const pair of routes) {
      for (const [route, other, target] of [
        [pair.en, 'ja', pair.ja],
        [pair.ja, 'en', pair.en],
      ] as const) {
        const links = html(route).match(new RegExp(`<a [^>]*hreflang="${other}"[^>]*>`, 'g')) ?? [];
        expect(links.length, `${route} has no link to ${other}`).toBeGreaterThan(0);
        for (const link of links) {
          expect(link, route).toContain(`href="${target}"`);
        }
      }
    }
  });

  // The build's own file names must never leak into a link.
  it('links to no .html path anywhere', () => {
    for (const p of [...PATHS, '/404']) {
      for (const prefix of ['', '/ja']) {
        const leaks = html(prefix + p).match(/(?:href|content)="[^"]*\.html["#?]/g) ?? [];
        expect(leaks, prefix + p).toEqual([]);
      }
    }
  });

  it('marks the current page in the nav, and only there', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const header = html(route).match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
        const marked = header.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
        const isNavPage = ['/experience', '/about', '/contact'].includes(pair.en);
        if (isNavPage) {
          expect(marked.length, route).toBeGreaterThan(0);
          for (const link of marked) expect(link, route).toContain(`href="${route}"`);
        } else {
          expect(marked, route).toEqual([]);
        }
      }
    }
  });

  // A Japanese page showing English nav means a t() call was hardcoded.
  it('does not leak English nav onto Japanese pages', () => {
    const doc = html('/ja');
    expect(doc).toContain('旅のプラン');
    expect(doc).not.toMatch(/>Experience</);
    expect(doc).not.toMatch(/>About</);
  });

  it('shows yen on Japanese pages only', () => {
    expect(html('/ja')).toMatch(/円/);
    expect(html('/')).not.toMatch(/円/);
  });
});

describe('content parity', () => {
  it('renders every offering in both locales', () => {
    const en = count(html('/'), /class="offer"/g);
    const ja = count(html('/ja'), /class="offer"/g);
    expect(en).toBe(offerings.length);
    expect(ja).toBe(offerings.length);
  });

  // A failed send has to say so and hand over the email address, rather than
  // point at fields that are fine.
  it('gives both forms a send-failure message with a way out', () => {
    for (const prefix of ['', '/ja']) {
      for (const page of ['/consult', '/book']) {
        const doc = html(prefix + page);
        expect(doc, prefix + page).toContain('data-send-error');
        expect(doc, prefix + page).toContain('href="mailto:losangelesluxurytour@gmail.com"');
      }
    }
  });

  // An unanswered "how did you hear about me" must send nothing, not the
  // placeholder text as an answer.
  it('sends nothing for the unanswered heard-about question', () => {
    expect(html('/consult')).not.toContain('value="Choose one"');
    expect(html('/ja/consult')).not.toContain('value="選択してください"');
  });

  // The FAQ is her text, verbatim. The cancellation terms are the line a
  // paraphrase would most plausibly drift on.
  it('keeps her FAQ wording', () => {
    expect(html('/ja/contact')).toContain('7日前まで：無料');
    expect(html('/ja/contact')).toContain('1時間12,000円にて延長が可能です');
    expect(html('/contact')).toContain('Up to 7 days before: free');
  });

  // Her Experience page copy, and the two links she asked for in the
  // plan-list intro.
  it('keeps her Experience wording and links the plan-list intro both ways', () => {
    const ja = html('/ja/experience');
    expect(ja).toContain('あなたの旅ができるまで');
    expect(ja).toContain('その時の気分にも、柔軟に');
    expect(ja).toMatch(/「<a href="\/ja\/book"[^>]*>予約する<\/a>」/);
    expect(ja).toMatch(/「<a href="\/ja\/consult"[^>]*>まずは相談する<\/a>」/);
    expect(html('/experience')).toMatch(/<a href="\/book"[^>]*>Book<\/a>/);
  });

  // Her About page: a brand page with a founder section, her headings, the
  // interview link without its tracking parameter, and the nav renamed.
  it('rebuilds the About page to her structure', () => {
    const ja = html('/ja/about');
    for (const s of ['ABOUT US｜私たちについて', 'FOUNDER｜代表紹介', 'OUR STORY｜', 'THE EXPERIENCE｜', 'MEDIA &amp; PRESS｜', 'PARTNERSHIP｜', '次は、あなたのロサンゼルスを。']) {
      expect(ja, s).toContain(s);
    }
    expect(ja).toContain('href="https://boldjourney.com/meet-amelia-perrin/"');
    expect(ja).not.toContain('fbclid');
    expect(ja).toContain('>私たちについて<');
    expect(ja).not.toContain('アメリアについて');
    expect(html('/about')).toContain('>About us<');
  });

  it('renders the same FAQ count in both locales', () => {
    const en = count(html('/contact'), /class="faq__item/g);
    const ja = count(html('/ja/contact'), /class="faq__item/g);
    expect(en).toBe(ja);
    expect(en).toBeGreaterThan(0);
  });
});

// All the built CSS, minified, as one string.
const css = () => {
  const dir = join(DIST, '_astro');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
};

type RGB = [number, number, number];

// A colour as the minifier writes it: #rgb, #rrggbb, or #rrggbbaa for what
// the source wrote as rgba(). Returns the colour and its alpha.
const parseHex = (h: string): { rgb: RGB; a: number } => {
  const x = h.slice(1);
  const full = x.length <= 4 ? [...x].map((c) => c + c).join('') : x;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { rgb: [n(0), n(2), n(4)], a: full.length === 8 ? n(6) / 255 : 1 };
};

const over = (top: { rgb: RGB; a: number }, under: RGB): RGB =>
  top.rgb.map((v, i) => v * top.a + under[i] * (1 - top.a)) as RGB;

const luminance = ([r, g, b]: RGB) => {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a: RGB, b: RGB) => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// Every declaration block whose selector list contains exactly `needle`,
// merged. The dark values live in a block shared by two selectors, so a regex
// anchored on one selector followed by "{" would miss it.
const block = (needle: string) =>
  [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.split(',').some((part) => part.trim() === needle))
    .map(([, , body]) => body)
    .join(';');

// The whole value of a token, up to the next declaration. Without the
// terminator a request for an rgba token would quietly return its first six
// digits and drop the alpha.
const token = (decls: string, name: string) =>
  decls.match(new RegExp(`(?:^|;)--${name}:(#[0-9a-f]{3,8})(?=;|$)`, 'i'))?.[1] ?? '';

const cream = () => block(':root');
const dark = () => block('html[data-theme=dark]');
const solid = (decls: string, name: string): RGB => parseHex(token(decls, name)).rgb;

describe('the palette and the gold rule', () => {
  // Cream is the default theme, on :root, with the four colours from Amelia's
  // brief. Her accent gold is about 3:1 on the cream: fine for a decorative
  // line or a button fill, not for text. So text gold is its own, darker token.
  //
  // These compute real ratios rather than asserting hex values. An earlier
  // version checked only that the token equalled #8a6d1f, which passed happily
  // while that colour measured 4.37:1 against the warm paper background.

  it('defines the cream theme as the default and dark as the override', () => {
    expect(token(cream(), 'bg'), ':root has no --bg').not.toBe('');
    expect(token(dark(), 'bg'), 'the dark block has no --bg').not.toBe('');
  });

  it('uses the four colours from her brief', () => {
    expect(token(cream(), 'ink').toLowerCase()).toBe('#191919');
    expect(token(cream(), 'bg').toLowerCase()).toBe('#faf9f6');
    expect(token(cream(), 'bg-deep').toLowerCase()).toBe('#f2f0e9');
    expect(token(cream(), 'gold-deco').toLowerCase()).toBe('#b18a3a');
  });

  // Every surface text gold can sit on, in both themes. The alternate cream
  // is the binding one.
  it('clears AA for text gold on every surface, in both themes', () => {
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const surface of ['bg', 'bg-deep', 'card'] as const) {
        const r = ratio(solid(decls, 'gold-text'), solid(decls, surface));
        expect(r, `${name}: --gold-text on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('clears AA for the soft and mid ink on every surface, in both themes', () => {
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const ink of ['ink-mid', 'ink-soft'] as const) {
        for (const surface of ['bg', 'bg-deep', 'card'] as const) {
          const under = solid(decls, surface);
          const r = ratio(over(parseHex(token(decls, ink)), under), under);
          expect(r, `${name}: --${ink} on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  // The solid CTA sets its label on the gold fill, resting and hovered. White
  // on that gold would be 3.2:1; an earlier hover colour was 4.3:1.
  it('clears AA for the label on the gold CTA, resting and hovered, in both themes', () => {
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const fill of ['cta', 'cta-hover']) {
        const r = ratio(solid(decls, 'on-cta'), solid(decls, fill));
        expect(r, `${name}: label on --${fill} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // What separates a control from the page has to clear 3:1: the CTA's edge
  // against both creams, and a form field's edge against every surface a form
  // sits on.
  it('gives the CTA and form fields an edge that clears 3:1', () => {
    for (const surface of ['bg', 'bg-deep'] as const) {
      const r = ratio(solid(cream(), 'cta-edge'), solid(cream(), surface));
      expect(r, `--cta-edge on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const surface of ['bg', 'bg-deep', 'surface'] as const) {
        const under = solid(decls, surface);
        const r = ratio(over(parseHex(token(decls, 'field-edge')), under), under);
        expect(r, `${name}: --field-edge on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // A plate (the header, the footer, a photo with text on it) is black in both
  // themes and takes its values from the same block as the dark theme, so the
  // bright gold on it needs no literal colours.
  it('gives a plate the dark values and leaves its two blacks alone', () => {
    const plate = block('.plate');
    expect(token(plate, 'gold-text').toLowerCase()).toBe('#d4af37');
    for (const black of ['bar', 'bar-deep'] as const) {
      const r = ratio(solid(plate, 'gold-text'), solid(cream(), black));
      expect(r, `gold on --${black} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      expect(token(dark(), black), `--${black} must not change with the theme`).toBe('');
    }
  });

  // form.hidden = true is how a form gets out of the way after a successful
  // submit. Any author display rule beats the browser's own [hidden] rule, so
  // the reset has to say it with !important.
  it('hides anything with the hidden attribute, whatever its own display rule', () => {
    expect(css()).toMatch(/\[hidden\]\{display:none!important\}/);
  });

  // A typo in a token name fails silently: the declaration is just dropped.
  it('defines every custom property the CSS reads without a fallback', () => {
    const sheet = css();
    const defined = new Set([...sheet.matchAll(/(--[a-z0-9-]+):/gi)].map((m) => m[1]));
    // Set inline, on the element, by the component that reads it.
    const inline = new Set(['--box']);
    const missing = [...sheet.matchAll(/var\((--[a-z0-9-]+)\)/gi)]
      .map((m) => m[1])
      .filter((name) => !defined.has(name) && !inline.has(name));
    expect([...new Set(missing)]).toEqual([]);
  });
});

// Cream is the default for every visitor, whatever their device prefers. Dark
// is only ever a saved choice.
describe('the default theme', () => {
  it('opens on cream and never reads the device preference', () => {
    for (const route of ['/', '/ja', '/ja/contact']) {
      const doc = html(route);
      expect(doc, route).toContain("localStorage.getItem('llt-theme') === 'dark'");
      expect(doc, route).not.toContain('prefers-color-scheme');
      expect(doc, route).not.toMatch(/<html[^>]*data-theme/);
    }
    // Nor may the stylesheet switch on it behind the page's back.
    expect(css()).not.toContain('prefers-color-scheme');
  });

  // The toggle is a script. Without one it is hidden rather than left dead.
  it('hides the theme toggle when there is no JavaScript', () => {
    expect(html('/ja')).toMatch(
      /<noscript><style>\[data-theme-toggle\]\{display:none!important\}<\/style><\/noscript>/,
    );
  });
});

// One row at every width: logo, language, and the way to the pages. Nothing
// floats over the page.
describe('the header and footer', () => {
  // Anchored on the class: the Experience page has another <footer> (under a
  // quotation) before the site's own.
  const header = (route: string) =>
    html(route).match(/<header class="site-header[\s\S]*?<\/header>/)?.[0] ?? '';
  const footer = (route: string) =>
    html(route).match(/<footer class="site-footer[\s\S]*?<\/footer>/)?.[0] ?? '';

  it('puts the language link in the header bar on every page', () => {
    for (const p of PATHS) {
      for (const [prefix, other] of [['', 'ja'], ['/ja', 'en']] as const) {
        expect(header(prefix + p), prefix + p).toMatch(
          new RegExp(`<a [^>]*class="lang-link"[^>]*hreflang="${other}"`),
        );
      }
    }
  });

  // The old language switch was a pill fixed to the corner of the screen,
  // over the content. Her brief: nothing may cover the page.
  it('pins nothing over the page', () => {
    expect(css()).not.toMatch(/position:fixed/);
  });

  // A link whose whole text is "EN" needs a name that says more, and the name
  // has to start with what is on screen. Each half carries its own language.
  it('names the language link, starting with its visible label', () => {
    expect(header('/ja')).toMatch(
      /<span class="lang-link__label" lang="en"[^>]*>EN<\/span>\s*<span class="sr-only" lang="en"[^>]*>English<\/span>/,
    );
    expect(header('/')).toMatch(
      /<span class="lang-link__label" lang="ja"[^>]*>日本語<\/span>\s*<span class="sr-only" lang="en"[^>]*>Japanese<\/span>/,
    );
  });

  // The home link's name has to contain the lockup's own lettering, as the
  // words it shows: two spans with nothing between them read as one word.
  it('names the home link after the lettering it shows', () => {
    for (const route of ['/', '/ja']) {
      const link = header(route).match(/<a class="brand"[^]*?<\/a>/)?.[0] ?? '';
      const name = link.match(/aria-label="([^"]*)"/)?.[1] ?? '';
      const shown = link.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      expect(shown, route).toBe('LOS ANGELES LUXURY TOUR');
      expect(name.toLowerCase(), route).toContain(shown.toLowerCase());
    }
  });

  // The mark is drawn at 129px; the 800px original must not be what ships,
  // and a 3x phone must not be handed the 2x file.
  it('serves the header mark as WebP at display size, 2x and 3x', () => {
    const img = header('/').match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toMatch(/src="\/_astro\/logo\.[^"]+\.webp"/);
    expect(img).toMatch(/srcset="[^"]+\.webp 1x, [^"]+\.webp 2x, [^"]+\.webp 3x"/);
    expect(img).not.toContain('.png');
  });

  // Two navigation landmarks with the same links, one for each layout. The
  // phone one wraps the <details>, so it exists whether the menu is open or
  // not, and the menu opens without JavaScript.
  it('gives the phone menu every link the bar has, inside its own nav', () => {
    const h = header('/ja');
    expect(count(h, /<nav /g)).toBe(2);
    expect(count(h, /<nav [^>]*aria-label="メインメニュー"/g)).toBe(2);
    expect(h).toMatch(/<nav class="menu-nav"[^>]*>\s*<details/);
    expect(h).toMatch(/<summary class="menu__button"[^>]*aria-label="メニュー"/);
    for (const href of ['/ja/experience', '/ja/about', '/ja/contact']) {
      expect(count(h, new RegExp(`href="${href}"`, 'g')), href).toBe(2);
    }
  });

  // Her brief: Email, Instagram and Facebook as icons; LINE and Threads out of
  // the footer. An icon-only link has no text, so every one needs a name.
  it('links the footer by icon, every one of them named', () => {
    for (const route of ['/', '/ja', '/experience']) {
      const links =
        footer(route).match(/<nav class="site-footer__links"[\s\S]*?<\/nav>/)?.[0] ?? '';
      const anchors = links.match(/<a [^>]*>/g) ?? [];
      expect(anchors.length, route).toBeGreaterThanOrEqual(2);
      for (const a of anchors) expect(a, route).toMatch(/aria-label="[^"]+"/);
      expect(links).toContain('href="mailto:losangelesluxurytour@gmail.com"');
      expect(links).toContain('href="https://www.instagram.com/losangelesluxurytour/"');
      expect(footer(route)).not.toContain('line.me');
      expect(footer(route)).not.toContain('threads.net');
    }
  });

  // On a 360px phone the line used to fold inside the number: 2175215- / 50.
  it('keeps the registration number in one piece', () => {
    for (const route of ['/', '/ja']) {
      expect(footer(route), route).toMatch(
        /<span class="site-footer__whole"[^>]*>[^<]*2175215-50\s*<\/span>/,
      );
    }
  });

  // Black in both themes: these take the dark tokens, not literal colours.
  it('marks the header, the footer and the skip link as plates', () => {
    const doc = html('/ja');
    expect(doc).toMatch(/<header class="site-header plate"/);
    expect(doc).toMatch(/<footer class="site-footer plate"/);
    expect(doc).toMatch(/<a class="skip-link plate"/);
  });
});

describe('photographs', () => {
  const picture = (route: string) =>
    html(route).match(/<picture[\s\S]*?<\/picture>/)?.[0] ?? '';
  const files = (srcset: string) =>
    srcset.split(',').map((part) => join(DIST, part.trim().split(' ')[0]));

  it('offers the opening photo as AVIF, then WebP, then JPEG, and fetches it first', () => {
    const pic = picture('/');
    const types = [...pic.matchAll(/<source type="(image\/[a-z]+)"/g)].map((m) => m[1]);
    expect(types).toEqual(['image/avif', 'image/webp']);
    const img = pic.match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toMatch(/src="[^"]+\.jpg"/);
    expect(img).toContain('fetchpriority="high"');
    expect(img).toContain('loading="eager"');
  });

  // A landscape photo in a tall phone hero is drawn wider than the screen. At
  // 100vw the browser fetched a 768px file and stretched it to over twice that.
  it('tells the browser the hero is drawn wider than a phone screen', () => {
    const sizes = picture('/').match(/sizes="([^"]+)"/)?.[1] ?? '';
    expect(sizes).toMatch(/\(max-aspect-ratio: [^)]+\) \d+vh, 100vw/);
  });

  it('leaves every photo that is not a page opener to load lazily', () => {
    const img = picture('/about').match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
    expect(img).not.toContain('fetchpriority');
  });

  // Listing AVIF first only helps if it is the smaller file. With one shared
  // quality it was a quarter larger than the WebP at every width.
  it('makes the AVIF the smallest file at every width', () => {
    const sets = [...picture('/').matchAll(/srcset="([^"]+)"/g)].map((m) => files(m[1]));
    const [avif, webp, jpg] = sets;
    expect(avif.length).toBeGreaterThan(3);
    for (let i = 0; i < avif.length; i++) {
      const [a, w, j] = [avif[i], webp[i], jpg[i]].map((f) => statSync(f).size);
      expect(a, `${avif[i]} (${a}) vs WebP (${w})`).toBeLessThan(w);
      expect(w, `${webp[i]} (${w}) vs JPEG (${j})`).toBeLessThan(j);
    }
  });
});

describe('output hygiene', () => {
  it('leaks no design-tool artifacts', () => {
    for (const p of PATHS) {
      const doc = html(p);
      expect(doc, p).not.toContain('{{');
      expect(doc, p).not.toContain('<x-dc');
      expect(doc, p).not.toContain('style-hover');
    }
  });

  it('keeps the LINE id lowercase in the markup', () => {
    expect(html('/contact')).toContain('@153cqwqp');
    expect(html('/contact')).not.toContain('@153CQWQP');
  });

  // Her California Seller of Travel registration, a compliance line on
  // advertising, which every page of this site is.
  it('carries the seller of travel registration on every page', () => {
    // The 404 pages too: they share the footer and are not in PATHS.
    for (const p of [...PATHS, '/404']) {
      for (const prefix of ['', '/ja']) {
        expect(html(prefix + p), prefix + p).toContain('2175215-50');
      }
    }
  });

  it('publishes no phone number', () => {
    for (const p of PATHS) {
      expect(html(p), p).not.toContain('808) 304-5451');
    }
  });
});

describe('every offering has somewhere to go', () => {
  const localized = (path: string, prefix: string) => `${prefix}${path}`;

  // Every plan card offers both paths, with the plan carried through.
  it('offers booking and consultation on every card', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(prefix + '/experience');
      for (const o of offerings) {
        if (o.slug) continue; // those cards link to the journey page instead
        expect(doc, `${prefix} ${o.id} book`).toContain(
          `href="${localized(`/book?service=${o.id}`, prefix)}"`,
        );
        expect(doc, `${prefix} ${o.id} consult`).toContain(
          `href="${localized(`/consult?service=${o.id}`, prefix)}"`,
        );
      }
    }
  });

  it('offers both paths from every journey and plan page', () => {
    for (const prefix of ['', '/ja']) {
      for (const j of [...journeys, ...plans]) {
        const doc = html(`${prefix}/experience/${j.slug}`);
        expect(doc, `${prefix} ${j.slug} book`).toContain(
          `href="${localized(`/book?service=${j.slug}`, prefix)}"`,
        );
        expect(doc, `${prefix} ${j.slug} consult`).toContain(
          `href="${localized(`/consult?service=${j.slug}`, prefix)}"`,
        );
      }
    }
  });

  // The contact page used to be the only destination. It is the chooser now.
  it('no longer sends anyone to the contact page with a plan', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        expect(html(prefix + p), prefix + p).not.toContain('/contact?service=');
      }
    }
  });

  it('links nothing to a JotForm', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        expect(html(prefix + p), prefix + p).not.toContain('jotform.com');
      }
    }
  });

  it('lists every plan in both forms, in the right language', () => {
    for (const [prefix, locale] of [['', 'en'], ['/ja', 'ja']] as const) {
      for (const page of ['/consult', '/book']) {
        const doc = html(prefix + page);
        for (const o of offerings) {
          // Scoped styles put a data-astro-cid attribute between the two.
          expect(doc, `${prefix}${page} ${o.id}`).toContain(`<option value="${o.id}"`);
          expect(doc, `${prefix}${page} ${o.id}`).toContain(`>${o.name[locale]}</option>`);
        }
      }
    }
  });
});

describe('the contact page chooses', () => {
  it('shows her heading and the two paths, in Japanese', () => {
    const doc = html('/ja/contact');
    expect(doc).toContain('ロサンゼルスで、');
    expect(doc).toContain('どんな時間を過ごしたいですか？');
    expect(doc).toContain('プランがお決まりの方');
    expect(doc).toContain('まだプランがお決まりでない方');
    expect(doc).toContain('href="/ja/book"');
    expect(doc).toContain('href="/ja/consult"');
  });

  it('offers the same two paths in English', () => {
    const doc = html('/contact');
    expect(doc).toContain('href="/book"');
    expect(doc).toContain('href="/consult"');
  });

  it('carries no form of its own any more', () => {
    expect(html('/contact')).not.toContain('action="/api/inquiry"');
    expect(html('/consult')).toContain('action="/api/inquiry"');
  });
});

describe('her sample plan, in her format', () => {
  const page = '/experience/dodgers-transfer';

  it('shows both price rows in yen on the Japanese page', () => {
    const doc = html('/ja' + page);
    for (const s of ['片道送迎', '49,800円', '往復送迎', '79,800円', '定員1名〜4名']) {
      expect(doc, s).toContain(s);
    }
  });

  it('shows her sections, labelled as she labelled them', () => {
    const doc = html('/ja' + page);
    for (const s of ['【サービス内容】', '【主な送迎エリア】', '【ご利用人数について】', '【料金補足】', '【ご利用前にご確認ください】']) {
      expect(doc, s).toContain(s);
    }
  });

  it('shows the yen prices on the English page without the 円 character', () => {
    const doc = html(page);
    expect(doc).toContain('¥49,800');
    expect(doc).toContain('¥79,800');
    expect(doc).not.toMatch(/円/);
  });

  it('puts both actions near the price and again at the bottom', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(prefix + page);
      expect(count(doc, new RegExp(`href="${prefix}/book\\?service=dodgers-transfer"`, 'g'))).toBe(2);
      expect(count(doc, new RegExp(`href="${prefix}/consult\\?service=dodgers-transfer"`, 'g'))).toBe(2);
    }
  });

  it('is on the list with only its lowest price', () => {
    expect(html('/ja/experience')).toContain('49,800円〜');
    expect(html('/ja/experience')).not.toContain('79,800');
    expect(html('/experience')).toContain('from ¥49,800');
  });
});

describe('the booking form', () => {
  // Her instruction, verbatim: a booking is submitted, then she checks
  // availability, then it is confirmed. The page must never say otherwise.
  const NOTICE =
    '※ご予約は送信後、Los Angeles Luxury Tour にて空き状況を確認し、通常24時間以内の承認をもって確定となります。';

  it('posts to its own endpoint', () => {
    expect(html('/book')).toContain('action="/api/booking"');
    expect(html('/ja/book')).toContain('action="/api/booking"');
  });

  it('asks for what she listed: plan, date, guests, name, contact, notes', () => {
    const doc = html('/book');
    for (const name of ['service', 'date', 'guests', 'name', 'email', 'line', 'notes']) {
      expect(doc, name).toContain(`name="${name}"`);
    }
    expect(doc).toContain('type="date"');
  });

  it('shows her approval notice on the form and on the received page', () => {
    expect(html('/ja/book')).toContain(NOTICE);
    expect(html('/ja/book/received')).toContain(NOTICE);
    expect(html('/book')).toMatch(/normally within 24 hours/);
    expect(html('/book/received')).toMatch(/normally within 24 hours/);
  });

  it('never calls a submitted booking confirmed', () => {
    for (const p of ['/book', '/book/received', '/ja/book', '/ja/book/received']) {
      const doc = html(p);
      expect(doc, p).not.toMatch(/booking is confirmed|reservation is confirmed\./i);
      expect(doc, p).not.toMatch(/ご予約が確定しました|予約確定/);
    }
  });
});

describe('sitemap', () => {
  const xml = () => readFileSync(join(DIST, 'sitemap.xml'), 'utf8');

  it('lists every page in every locale', () => {
    expect(count(xml(), /<loc>/g)).toBe(
      (PATHS.length - NOT_IN_SITEMAP.length) * 2,
    );
  });

  it('leaves the form destinations out', () => {
    for (const p of NOT_IN_SITEMAP) {
      expect(xml(), p).not.toContain(`<loc>https://losangelesluxurytour.com${p}</loc>`);
      expect(xml(), p).not.toContain(`<loc>https://losangelesluxurytour.com/ja${p}</loc>`);
    }
  });

  it('gives each url its alternates', () => {
    const urls = count(xml(), /<loc>/g);
    // en + ja + x-default per url
    expect(count(xml(), /hreflang=/g)).toBe(urls * 3);
  });

  it('points robots at itself', () => {
    expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain(
      'sitemap.xml',
    );
  });
});
