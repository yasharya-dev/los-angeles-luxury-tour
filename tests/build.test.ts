// Runs against dist/, so `npm run build` has to have happened first.
// `npm test` chains them.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { offerings } from '../src/data/offerings';
import { journeys } from '../src/data/journeys';

const DIST = join(process.cwd(), 'dist');

const PATHS = [
  '/',
  '/experience',
  ...journeys.map((j) => `/experience/${j.slug}`),
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

  it('declares reciprocal hreflang alternates', () => {
    for (const p of PATHS) {
      for (const route of [p, '/ja' + p]) {
        const doc = html(route);
        expect(doc, `${route} en alt`).toMatch(/hreflang="en"/);
        expect(doc, `${route} ja alt`).toMatch(/hreflang="ja"/);
        expect(doc, `${route} x-default`).toMatch(/hreflang="x-default"/);
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

  it('renders the same FAQ count in both locales', () => {
    const en = count(html('/contact'), /class="faq__item/g);
    const ja = count(html('/ja/contact'), /class="faq__item/g);
    expect(en).toBe(ja);
    expect(en).toBeGreaterThan(0);
  });
});

describe('the light theme gold rule', () => {
  // #D4AF37 is 9.0:1 on the dark plate but only about 2:1 on the light one, so
  // the light theme swaps in a darker gold for anything meaning-carrying.
  //
  // This computes real ratios rather than asserting a hex value. The earlier
  // version checked only that the token equalled #8a6d1f, which passed happily
  // while that colour measured 4.37:1 against the warm paper background. The
  // token was never the thing that mattered.
  const css = () => {
    const dir = join(DIST, '_astro');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
  };

  const hex = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];

  const luminance = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const contrast = (a: string, b: string) => {
    const [l1, l2] = [luminance(hex(a)), luminance(hex(b))];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const lightBlock = () =>
    css().match(/data-theme=light\]\{[^}]*\}/)?.[0] ?? '';

  const token = (block: string, name: string) =>
    block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i'))?.[1] ?? '';

  it('defines a light theme block', () => {
    expect(lightBlock(), 'light theme block not found').not.toBe('');
  });

  // Both light surfaces, because the sections alternate between them and the
  // darker one is the binding constraint.
  it('clears AA for meaning-carrying gold on every light surface', () => {
    const block = lightBlock();
    const gold = token(block, 'gold-text');
    expect(gold, '--gold-text missing').toMatch(/^#[0-9a-f]{6}$/i);

    for (const surface of ['bg', 'bg-deep'] as const) {
      const bg = token(block, surface);
      expect(bg, `--${surface} missing`).toMatch(/^#[0-9a-f]{6}$/i);
      const ratio = contrast(gold, bg);
      expect(
        ratio,
        `--gold-text ${gold} on --${surface} ${bg} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the bright gold usable on the dark plate', () => {
    // --bar never changes with the theme, which is what makes the literal
    // #d4af37 on the header, footer, hero and skip link safe.
    expect(contrast('#d4af37', '#101010')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the decorative wedge gold bright', () => {
    expect(lightBlock()).toMatch(/--wedge:#d4af37/i);
  });

  // form.hidden = true is how the contact form gets out of the way after a
  // successful submit. Any author display rule beats the browser's own
  // [hidden] rule, so the reset has to say it with !important.
  it('hides anything with the hidden attribute, whatever its own display rule', () => {
    expect(css()).toMatch(/\[hidden\]\{display:none!important\}/);
  });

  it('does not override the dark plate tokens in light', () => {
    const block = lightBlock();
    for (const t of ['--bar:', '--bar-deep:', '--pill:']) {
      expect(block, t).not.toContain(t);
    }
  });

  // The skip link sits on --bar, so its colour must not follow --gold-text.
  it('does not let the skip link darken with the theme', () => {
    const rule = css().match(/\.skip-link\{[^}]*\}/)?.[0] ?? '';
    expect(rule, '.skip-link rule not found').not.toBe('');
    expect(rule).not.toMatch(/color:var\(--gold-text\)/);
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

  it('offers both paths from every journey page', () => {
    for (const prefix of ['', '/ja']) {
      for (const j of journeys) {
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
