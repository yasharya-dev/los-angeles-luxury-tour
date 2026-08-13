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
  '/privacy',
  '/thank-you',
];

const html = (route: string) => {
  const file =
    route === '/' ? 'index.html' : join(route.replace(/^\//, ''), 'index.html');
  return readFileSync(join(DIST, file), 'utf8');
};

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
        const file =
          route === '/'
            ? 'index.html'
            : join(route.replace(/^\//, ''), 'index.html');
        expect(existsSync(join(DIST, file)), route).toBe(true);
      }
    }
  });

  it('builds 404, sitemap and robots', () => {
    expect(existsSync(join(DIST, '404.html'))).toBe(true);
    expect(existsSync(join(DIST, 'sitemap.xml'))).toBe(true);
    expect(existsSync(join(DIST, 'robots.txt'))).toBe(true);
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

describe('sitemap', () => {
  const xml = () => readFileSync(join(DIST, 'sitemap.xml'), 'utf8');

  it('lists every page in every locale', () => {
    // /thank-you is deliberately excluded: it is a form destination, not a
    // page anyone should land on from search.
    expect(count(xml(), /<loc>/g)).toBe((PATHS.length - 1) * 2);
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
