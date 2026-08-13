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
  // #D4AF37 on white is 2.1:1. It fails AA for text and fails the 3:1 floor
  // for UI components, so the light theme must swap in a darkened gold for
  // anything that carries meaning. This is the constraint most likely to be
  // "simplified" away by someone tidying the tokens.
  const css = () => {
    const dir = join(DIST, '_astro');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
  };

  it('defines a light theme block', () => {
    expect(css()).toMatch(/data-theme=light\]/);
  });

  it('never uses the bright gold as meaning-carrying colour in light', () => {
    const light = css().match(/data-theme=light\]\{[^}]*\}/)?.[0] ?? '';
    expect(light, 'light theme block not found').not.toBe('');
    expect(light).toMatch(/--gold-text:#8a6d1f/i);
    expect(light).not.toMatch(/--gold-text:#d4af37/i);
  });

  it('keeps the decorative wedge gold bright', () => {
    const light = css().match(/data-theme=light\]\{[^}]*\}/)?.[0] ?? '';
    expect(light).toMatch(/--wedge:#d4af37/i);
  });

  // The dark plates stay dark in both themes, which is what makes the
  // hardcoded #d4af37 on the header, footer and hero safe.
  it('does not override the dark plate tokens in light', () => {
    const light = css().match(/data-theme=light\]\{[^}]*\}/)?.[0] ?? '';
    for (const token of ['--bar:', '--bar-deep:', '--pill:']) {
      expect(light, token).not.toContain(token);
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
