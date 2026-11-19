// Runs against dist/, so `npm run build` has to have happened first.
// `npm test` chains them.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import sharp from 'sharp';
import { offerings } from '../src/data/offerings';
import { journeys } from '../src/data/journeys';
import { plans } from '../src/data/plans';
import { SUMMARY_MARK } from '../src/data/booking';
import { SUBMISSIONS } from '../worker/index';

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
  ...offerings.map((o) => `/book/${o.id}`),
];

// Not pages for search: a not-found page, a form, the page after one. Each
// says noindex, claims no canonical, og:url or alternates, and stays out of
// the sitemap. The plan pages are what a search should find.
const NOINDEX = [
  '/404',
  '/thank-you',
  '/book/received',
  ...offerings.map((o) => `/book/${o.id}`),
];

// build.format is 'file': /about is about.html and /ja is ja.html. Only the
// site root is an index.html.
const distFile = (route: string) => {
  const bare = route.replace(/\/$/, '');
  return join(DIST, bare === '' ? 'index.html' : `${bare}.html`);
};

const html = (route: string) => readFileSync(distFile(route), 'utf8');

/** Every HTML file the build wrote, from the dist folder itself. */
const allPages = (dir = DIST): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allPages(path);
    return name.endsWith('.html') ? [path] : [];
  });

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

  // Her monogram in the tab and on a phone's home screen. Before, every page
  // load logged a 404 for /favicon.ico.
  it('links a tab icon and a home-screen icon, and ships them', () => {
    for (const route of ['/', '/ja', '/ja/book/dodgers-transfer', '/404']) {
      const doc = html(route);
      expect(doc, route).toMatch(/<link rel="icon" href="\/favicon.ico"/);
      expect(doc, route).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon.png"/);
    }
    for (const file of ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png']) {
      expect(statSync(join(DIST, file)).size, file).toBeGreaterThan(1000);
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
  // Every page the build writes, the two not-found pages included.
  const routes = [...PATHS, '/404'].map((p) => ({ en: p, ja: p === '/' ? '/ja' : `/ja${p}` }));
  const all = (tag: RegExp, doc: string) => doc.match(tag) ?? [];

  // The list these checks read is every page the build writes: a page added
  // without an entry in PATHS would otherwise get none of them.
  it('reads every page the build writes', () => {
    const built = allPages().map((file) => {
      const route = file.slice(DIST.length).split(sep).join('/').replace(/\.html$/, '');
      return route === '/index' ? '/' : route;
    });
    expect(new Set(built)).toEqual(new Set(routes.flatMap((pair) => [pair.en, pair.ja])));
  });

  // Exactly one of each, by value: a second, conflicting canonical passed a
  // substring check.
  it('gives a page for search one canonical and og:url, its own, and the rest noindex', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const doc = html(route);
        const canonical = all(/<link\b[^>]*\brel="canonical"[^>]*>/g, doc);
        const ogUrl = all(/<meta\b[^>]*\bproperty="og:url"[^>]*>/g, doc);
        const robots = all(/<meta\b[^>]*\bname="robots"[^>]*>/g, doc);
        if (NOINDEX.includes(pair.en)) {
          expect(canonical, route).toEqual([]);
          expect(ogUrl, route).toEqual([]);
          expect(robots, route).toEqual(['<meta name="robots" content="noindex">']);
        } else {
          expect(canonical, route).toEqual([`<link rel="canonical" href="${SITE}${route}">`]);
          expect(ogUrl, route).toEqual([`<meta property="og:url" content="${SITE}${route}">`]);
          expect(robots, route).toEqual([]);
        }
      }
    }
  });

  it('declares exactly three reciprocal alternates on a page for search, and none elsewhere', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const alternates = all(/<link\b[^>]*\brel="alternate"[^>]*>/g, html(route));
        expect(alternates, route).toEqual(
          NOINDEX.includes(pair.en)
            ? []
            : [
                `<link rel="alternate" hreflang="en" href="${SITE}${pair.en}">`,
                `<link rel="alternate" hreflang="ja" href="${SITE}${pair.ja}">`,
                `<link rel="alternate" hreflang="x-default" href="${SITE}${pair.en}">`,
              ],
        );
      }
    }
  });

  // Entry for entry: the sitemap lists exactly the pages for search, and each
  // entry's location and alternates are the ones its page declares.
  it('agrees with the sitemap', () => {
    const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const entries = [...xml.matchAll(/<url>([^]*?)<\/url>/g)].map(([, body]) => ({
      loc: body.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '',
      alternates: [...body.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      ),
    }));
    const pages = routes.flatMap((pair) => (NOINDEX.includes(pair.en) ? [] : [pair.en, pair.ja]));
    expect(entries.map((e) => e.loc).sort()).toEqual(pages.map((r) => SITE + r).sort());
    for (const entry of entries) {
      const route = entry.loc.slice(SITE.length);
      const doc = html(route);
      expect(all(/<link\b[^>]*\brel="canonical"[^>]*>/g, doc), route).toEqual([
        `<link rel="canonical" href="${entry.loc}">`,
      ]);
      const declared = [...doc.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      );
      expect(entry.alternates, route).toEqual(declared);
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

  // The site's own addresses, in every attribute that holds one: a link out
  // to another site may end in .html, and is none of the build's business.
  const ownUrls = (doc: string) =>
    [...doc.matchAll(/(?:href|src|action|content)="([^"]*)"/g)]
      .map((m) => m[1])
      .filter((v) => (v.startsWith('/') && !v.startsWith('//')) || v.startsWith(SITE));

  // The build's own file names must never leak into a link.
  it('links to no .html path of its own anywhere', () => {
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const leaks = ownUrls(html(route)).filter((v) => /\.html(?:[#?]|$)/.test(v));
        expect(leaks, route).toEqual([]);
      }
    }
  });

  // The general form of what #78 fixed: a link to a file the build never
  // wrote. Every address of its own, in a link, a source, an image set or a
  // form's action, is a built file or a route the Worker answers.
  it('links only to files the build wrote, or to a Worker route', () => {
    const worker = new Set(Object.keys(SUBMISSIONS));
    const resolves = (url: string) => {
      const path = decodeURI(url.replace(SITE, '').split(/[?#]/)[0]) || '/';
      if (worker.has(path)) return true;
      if (path === '/') return existsSync(join(DIST, 'index.html'));
      const file = join(DIST, path);
      return (existsSync(file) && statSync(file).isFile()) || existsSync(`${file}.html`);
    };
    for (const pair of routes) {
      for (const route of [pair.en, pair.ja]) {
        const doc = html(route);
        const sets = [...doc.matchAll(/srcset="([^"]+)"/g)].flatMap((m) =>
          m[1].split(',').map((c) => c.trim().split(/\s+/)[0]),
        );
        const urls = [...ownUrls(doc), ...sets.filter((u) => u.startsWith('/'))];
        expect(urls.length, route).toBeGreaterThan(10);
        for (const url of urls) expect(resolves(url), `${route} -> ${url}`).toBe(true);
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
    const cards = /<article class="plan /g;
    expect(count(html('/'), cards)).toBe(offerings.length);
    expect(count(html('/ja'), cards)).toBe(offerings.length);
  });

  // A failed send has to say so and hand over the email address, rather than
  // point at fields that are fine.
  it('gives both forms a send-failure message with a way out', () => {
    for (const prefix of ['', '/ja']) {
      for (const page of ['/consult', '/book/dodgers-transfer', '/book/temecula']) {
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
    expect(bare('/ja/contact')).toContain('7日前まで：無料');
    expect(bare('/ja/contact')).toContain('1時間12,000円にて延長が可能です');
    expect(html('/contact')).toContain('Up to 7 days before: free');
  });

  it('renders the same FAQ count in both locales', () => {
    const en = count(html('/contact'), /class="faq__item/g);
    const ja = count(html('/ja/contact'), /class="faq__item/g);
    expect(en).toBe(ja);
    expect(en).toBeGreaterThan(0);
  });
});

// The text a visitor SEES on a page, with the markup taken out and all
// whitespace removed, so a string of hers can be looked for whole however it
// was folded for display (<wbr> between phrases, <br> where she asked for a
// break). Text that only a screen reader gets is left out: it is ours.
const bare = (route: string) =>
  html(route)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    // Spaces, the invisible fold (U+200B) that is not one to a regex, and the
    // word joiner (U+2060) that holds a phrase together in Chromium.
    .replace(/[\s\u200b\u2060]+/g, '');

// Amelia's homepage, section by section, from her brief of 2026-11-05. Her
// Japanese is checked character for character, and in her order.
describe('the homepage, in her six sections', () => {
  const HERS = [
    '完全予約制｜日本語対応プライベートツアー',
    'ロサンゼルスで叶える、あなただけの特別な旅。',
    '旅のご相談はこちら',
    '安心も、楽しさも、満足も。',
    'ロサンゼルスを、もっと自由に。もっと贅沢に。',
    '現地在住の日本人ガイドが、移動から観光まで、お客様だけの旅をサポートします。',
    '選ばれる3つの理由',
    '日本語で安心',
    '高級車で完全貸切',
    'オーダーメイドの旅',
    'ツアー・サービス',
    '旅のスタイルに合わせたプランをご用意しています。',
    '完全予約制',
    'ご希望の日程でご案内できるよう、ご旅行の日程がお決まりの方はお早めにご相談ください。',
    'ロサンゼルスで、どんな時間を過ごしたいですか？',
    '旅のプランが決まっていなくても、お気軽にご相談ください。通常24時間以内にご返信いたします。',
  ];

  it('carries her copy verbatim, in her order', () => {
    const page = bare('/ja');
    let from = 0;
    for (const line of HERS) {
      const at = page.indexOf(line.replace(/\s+/g, ''), from);
      expect(at, `missing or out of order: ${line}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    }
  });

  // What she asked to come out: the hero's long paragraph, the three body
  // paragraphs, the three described pillars, and any exchange rate.
  it('drops what her brief removed', () => {
    const page = bare('/ja');
    for (const gone of [
      '安心して過ごせることも、旅の質のひとつ',
      '見どころが広いエリアに点在する車社会の街',
      '細部まで行き届く安心を',
      'Los Angeles Luxury Tour が選ばれる理由',
      '163円',
    ]) {
      expect(page, gone).not.toContain(gone.replace(/\s+/g, ''));
    }
    expect(html('/')).not.toContain('¥163');
  });

  it('opens on a photo hero with one call to action, to the contact page', () => {
    for (const [route, contact] of [['/', '/contact'], ['/ja', '/ja/contact']] as const) {
      const hero = html(route).match(/<section class="photo-hero[\s\S]*?<\/section>/)?.[0] ?? '';
      expect(hero, route).toContain('photo-hero--tall');
      expect(count(hero, /<a /g), route).toBe(1);
      expect(hero, route).toMatch(new RegExp(`<a class="btn btn--solid[^"]*" href="${contact}"`));
      expect(count(hero, /<h1/g), route).toBe(1);
      expect(count(hero, /<p /g), `${route}: only the eyebrow, no lead paragraph`).toBe(1);
    }
  });

  // Three equal cards, icon and title only, in both languages. Her two
  // permitted breaks are the only places a title may fold.
  it('shows three reasons as icon and title, with her line breaks', () => {
    for (const route of ['/', '/ja']) {
      const list = html(route).match(/<ul class="reasons__list[\s\S]*?<\/ul>/)?.[0] ?? '';
      expect(count(list, /<li class="reason /g), route).toBe(3);
      expect(count(list, /<svg/g), route).toBe(3);
      expect(count(list, /<p[ >]/g), `${route}: no descriptions`).toBe(0);
    }
    // Each title, with "/" where she breaks the line. The title is one
    // piece of text with an invisible fold (U+200B) at her break: no element
    // and no space inside it, either of which shows as a gap in WebKit
    // wherever the title runs on one line.
    const titles = [...html('/ja').matchAll(/<h3 class="reason__title"[^>]*>([^]*?)<\/h3>/g)].map(
      ([, inner]) => {
        expect(inner.trim()).not.toMatch(/[<\s]/);
        return inner.trim().replace(/\u200b/g, '/');
      },
    );
    expect(titles).toEqual(['日本語で安心', '高級車で/完全貸切', 'オーダーメイドの/旅']);
  });

  // A plan with its own page links to it. The rest open in place and hold
  // what the visitor came for: the description and both ways to act on it.
  it('lists every plan as a card with its price and a way to its details', () => {
    // The word joiner (U+2060) holds a phrase together and is not text.
    const text = (markup: string) =>
      markup.replace(/<[^>]+>/g, '').replace(/[\s\u2060]+/g, '');
    const labels = { en: 'Details', ja: '詳細を見る' };
    for (const [prefix, locale] of [['', 'en'], ['/ja', 'ja']] as const) {
      const doc = html(prefix || '/');
      for (const o of offerings) {
        // [^] is "any character, newlines included", with no backslash to lose
        // inside a template literal.
        const card =
          doc.match(new RegExp(`<article class="plan[^"]*" id="plan-${o.id}"[^]*?</article>`))?.[0] ?? '';
        expect(card, `${prefix} ${o.id}`).not.toBe('');
        expect(text(card), `${prefix} ${o.id} price`).toContain(text(o.price[locale]));
        if (o.slug) {
          expect(card, `${prefix} ${o.id} link`).toContain(`href="${prefix}/experience/${o.slug}"`);
          // The link's name starts with its visible label and says which plan.
          expect(card, `${prefix} ${o.id} name`).toContain(
            `aria-label="${labels[locale]}: ${o.name[locale]}"`,
          );
        } else {
          expect(text(card), `${prefix} ${o.id} description`).toContain(
            text(o.detail?.[locale].body ?? 'no detail'),
          );
          expect(card, `${prefix} ${o.id} book`).toContain(`href="${prefix}/book/${o.id}"`);
          expect(card, `${prefix} ${o.id} ask`).toContain(`href="${prefix}/consult?service=${o.id}"`);
        }
      }
    }
  });

  // A summary is a button, and a screen reader flattens what is inside a
  // button. With the whole card in it, the plan's name stopped being a
  // heading for the six cards that open in place. The name stays outside.
  it('keeps every plan name a heading, outside the control that opens the card', () => {
    for (const route of ['/', '/ja', '/experience', '/ja/experience']) {
      const doc = html(route);
      const cards = doc.match(/<article class="plan [^]*?<\/article>/g) ?? [];
      expect(cards.length, route).toBe(offerings.length);
      for (const card of cards) {
        expect(count(card, /<h4 class="plan__name"/g), route).toBe(1);
        for (const summary of card.match(/<summary[^]*?<\/summary>/g) ?? []) {
          expect(summary, route).not.toMatch(/<h\d/);
          // It says which plan it opens, for someone moving control to control.
          expect(summary, route).toMatch(/<span class="sr-only"[^>]*>: [^<]+<\/span>/);
        }
      }
      expect(count(doc, /<summary class="plan__row"/g), route).toBe(
        offerings.filter((o) => !o.slug).length,
      );
    }
  });

  // One action, one label. 「このプランを申し込む」 is hers, for the plan page;
  // the older 「このプランを予約する」 was ours and said something stronger than a
  // request.
  it('names the booking request the same way wherever a plan can be requested', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        expect(html(prefix + p), prefix + p).not.toMatch(
          /このプランを予約する|Book this plan|Reserve this journey/,
        );
      }
    }
    const pages = ['', '/experience', ...[...journeys, ...plans].map((j) => `/experience/${j.slug}`)];
    for (const page of pages) {
      expect(html(`/ja${page}`), `/ja${page}`).toContain('このプランを申し込む');
      expect(html(page || '/'), page || '/').toContain('Request this plan');
    }
  });

  it('keeps the reservation note and the closing call together, with no second button in between', () => {
    const closing = html('/ja').match(/<section class="section closing[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(closing).toContain('class="reservation plate"');
    expect(count(closing, /<a /g)).toBe(1);
    expect(closing).toContain('href="/ja/contact"');
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

// Every class a button carries anywhere on the site (.btn, its modifiers and
// each component's own class for it), and a test for whether a selector
// names one of them. A scoped rule names the class with Astro's attribute
// after it, so a class counts only where no name character follows.
const buttonClasses = (() => {
  let found: Set<string> | undefined;
  return () => {
    if (found) return found;
    found = new Set<string>();
    for (const file of allPages()) {
      for (const [, list] of readFileSync(file, 'utf8').matchAll(/class="([^"]*\bbtn\b[^"]*)"/g)) {
        for (const name of list.split(/\s+/)) if (name) found.add(name);
      }
    }
    return found;
  };
})();
const namesAButtonClass = (selector: string) => {
  const names = [...buttonClasses()].map((name) => name.replace(/[^\w-]/g, '\\$&'));
  return new RegExp(String.raw`\.(?:${names.join('|')})(?![\w-])`).test(selector);
};

// The rules of the built CSS, as [selector, body] pairs, for the innermost
// block of each (a rule inside @media keeps its own selector).
const cssRules = () => [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]);

// The rules inside every @media or @supports block whose condition matches,
// run together. The minifier may write a width query either way round, so
// the condition is a pattern: /^\((?:min-width:\s?681px|width>=681px)\)$/.
const within = (condition: RegExp) => {
  const text = css();
  const found: string[] = [];
  for (const m of text.matchAll(/@(?:media|supports)([^{]*)\{/g)) {
    if (!condition.test(m[1].trim())) continue;
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    found.push(text.slice(start, i - 1));
  }
  return found.join('');
};

describe('the palette and the gold rule', () => {
  // Cream is the default theme, on :root, with the four colours from Amelia's
  // brief. Her accent gold is about 3:1 on the cream: fine for a decorative
  // line, not for text. So text gold is its own, darker token.
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
  // is the binding one. The glow is where the section under the homepage
  // photo starts, under her gold phrase.
  it('clears AA for text gold on every surface, in both themes', () => {
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const surface of ['bg', 'bg-deep', 'card', 'glow'] as const) {
        const r = ratio(solid(decls, 'gold-text'), solid(decls, surface));
        expect(r, `${name}: --gold-text on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('clears AA for the soft and mid ink on every surface, in both themes', () => {
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      for (const ink of ['ink-mid', 'ink-soft'] as const) {
        for (const surface of ['bg', 'bg-deep', 'card', 'glow'] as const) {
          const under = solid(decls, surface);
          const r = ratio(over(parseHex(token(decls, ink)), under), under);
          expect(r, `${name}: --${ink} on --${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  // The solid button is her flat olive with a white label, resting, hovered
  // and pressed. Her golds carry white at only 3.1 to 3.9:1; this one keeps
  // their hue at a lightness where white clears AA. It is the same in both
  // themes: the dark block leaves it alone.
  it('clears AA for the label on the solid button, in every state', () => {
    const label = solid(cream(), 'on-cta');
    for (const fill of ['cta', 'cta-hover', 'cta-press']) {
      const r = ratio(label, solid(cream(), fill));
      expect(r, `label on --${fill} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
    expect(dark()).not.toMatch(/(?:^|;)--(?:on-)?cta(?:-hover|-press)?:/);
    const rules = css();
    expect(rules).toMatch(/\.btn--solid\{[^}]*background-color:var\(--cta\)/);
    expect(rules).toMatch(/\.btn--solid:hover\{[^}]*background-color:var\(--cta-hover\)/);
    expect(rules).toMatch(/\.btn--solid:active\{[^}]*background-color:var\(--cta-press\)/);
    expect(rules).toMatch(/\.btn--solid:hover\{(?:[^}]*;)?color:var\(--on-cta\)/);
  });

  // A button is a link, and the links' own a:hover turns text ink: every
  // button's variant names its label's colour on hover itself, and only that
  // one, or the outline's gold and the solid buttons' white would be lost.
  // Any other hover rule on a class a button carries may set a label colour
  // only where every button carrying that class shares it.
  it('keeps every button label its own colour on hover', () => {
    const variants: Record<string, string> = {
      '.btn:hover': 'var(--gold-text)',
      '.btn--solid:hover': 'var(--on-cta)',
      '.btn--champagne:hover': 'var(--on-champagne)',
    };
    const labelsSet = (body: string) =>
      [...body.matchAll(/(?:^|;)(?:-webkit-text-fill-color|color):([^;]+)/g)].map(([, value]) => value.trim());
    const rules = cssRules();
    for (const [variant, label] of Object.entries(variants)) {
      const set = rules.filter(([selector]) => selector === variant).flatMap(([, body]) => labelsSet(body));
      expect(set, variant).toContain(label);
      for (const value of set) expect(value, variant).toBe(label);
    }
    // The label each button's finish gives it: champagne, else solid, else
    // the outline's gold; and the finishes each class is carried with.
    const finishes = new Map<string, Set<string>>();
    for (const file of allPages()) {
      for (const [, list] of readFileSync(file, 'utf8').matchAll(/class="([^"]*\bbtn\b[^"]*)"/g)) {
        const names = list.split(/\s+/).filter(Boolean);
        const label = names.includes('btn--champagne')
          ? 'var(--on-champagne)'
          : names.includes('btn--solid')
            ? 'var(--on-cta)'
            : 'var(--gold-text)';
        for (const name of names) finishes.set(name, (finishes.get(name) ?? new Set<string>()).add(label));
      }
    }
    for (const [selector, body] of rules) {
      if (selector in variants || !/:hover\b/.test(selector) || !namesAButtonClass(selector)) continue;
      const named = [...finishes.keys()].filter((name) =>
        new RegExp(String.raw`\.${name.replace(/[^\w-]/g, '\\$&')}(?![\w-])`).test(selector),
      );
      for (const value of labelsSet(body)) {
        const allowed = named.every((name) => finishes.get(name)!.size === 1 && finishes.get(name)!.has(value));
        expect(allowed, `${selector} sets a label colour of ${value}`).toBe(true);
      }
    }
  });

  // The outline button's gold label on its cream fill, and on the gold tint
  // it takes on hover; the quiet pill's grey on its fill; the grey of a
  // second action on the cards and the page. In both themes.
  it('clears AA for the outline, the quiet pill and the second actions', () => {
    // The rules paint the tokens measured below.
    const rules = cssRules();
    const bodyOf = (pattern: RegExp) =>
      rules
        .filter(([selector]) => pattern.test(selector))
        .map(([, body]) => body)
        .join(';');
    expect(bodyOf(/^\.btn$/)).toMatch(/(?:^|;)background-color:var\(--btn-fill\)/);
    expect(bodyOf(/^\.btn$/)).toMatch(/(?:^|;)color:var\(--gold-text\)/);
    expect(bodyOf(/^\.btn:hover$/)).toMatch(/(?:^|;)background-color:var\(--btn-hover\)/);
    // Off the solid finishes, a rule on a button class paints only those two.
    for (const [selector, body] of rules) {
      if (!namesAButtonClass(selector) || /\.btn--(?:solid|champagne)(?![\w-])/.test(selector)) continue;
      for (const [, value] of body.matchAll(/(?:^|;)background(?:-color)?:([^;]+)/g)) {
        expect(['var(--btn-fill)', 'var(--btn-hover)'], `${selector} paints ${value}`).toContain(value.trim());
      }
    }
    const pill = bodyOf(/^\.plan__more\[data-astro-cid-[\w-]+\]$/);
    expect(pill).toMatch(/(?:^|;)background:var\(--chip-fill\)/);
    expect(pill).toMatch(/(?:^|;)color:var\(--quiet-ink\)/);
    for (const name of ['pricing__ask', 'reveal__ask', 'ask']) {
      expect(bodyOf(new RegExp(String.raw`^\.${name}\[data-astro-cid-[\w-]+\]$`)), name).toMatch(
        /(?:^|;)color:var\(--quiet-ink\)/,
      );
    }
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      // A token painted over what is under it, read as the theme sets it: a
      // colour, another token (the dark theme's grey is its mid ink), or
      // transparent, which leaves what is under it. Anything else is a value
      // this test cannot judge, and fails it.
      const paint = (tokenName: string, under: RGB): RGB => {
        const value = decls.match(new RegExp(`(?:^|;)--${tokenName}:([^;]+)`))?.[1].trim() ?? '';
        const named = value.match(/^var\(--([\w-]+)\)$/);
        if (named) return paint(named[1], under);
        if (value === 'transparent') return under;
        if (!/^#[0-9a-f]{3,8}$/i.test(value)) throw new Error(`${name}: --${tokenName} is ${value || 'missing'}`);
        return over(parseHex(value), under);
      };
      const card = solid(decls, 'card');
      const label = solid(decls, 'gold-text');
      const checks: [string, RGB, RGB][] = [
        ['the outline label on its fill', label, paint('btn-fill', card)],
        ['the outline label hovered', label, paint('btn-hover', card)],
      ];
      for (const surface of ['card', 'bg'] as const) {
        const under = solid(decls, surface);
        const chip = paint('chip-fill', under);
        checks.push(
          [`the quiet pill on --${surface}`, paint('quiet-ink', chip), chip],
          [`a second action on --${surface}`, paint('quiet-ink', under), under],
        );
      }
      for (const [what, fg, bg] of checks) {
        const r = ratio(fg, bg);
        expect(r, `${name}: ${what} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // Her champagne, on her two homepage buttons, in both tints: her brown
  // label against the deepest colour the finish paints at rest and hovered,
  // and against every stop of the sheen under the strongest deep corner with
  // the pressed layer on top, which is darker than anything resting.
  it('clears AA for the label on every colour of the champagne, in both tints', () => {
    const value = (decls: string, name: string) =>
      decls.match(new RegExp(`(?:^|;)--${name}:([^;]+)`))?.[1] ?? '';
    // Each theme maps the sheen to its own tint.
    expect(value(cream(), 'champagne-sheen')).toBe('var(--champagne-sheen-cream)');
    expect(value(dark(), 'champagne-sheen')).toBe('var(--champagne-sheen-dark)');
    // Both tints are defined once, on :root; each theme picks its own.
    for (const [name, decls] of [['cream', cream()], ['dark', dark()]] as const) {
      // A theme's own corners and pressed layer, where it sets them.
      const layer = (token: string) => value(decls, token) || value(cream(), token);
      const deep = (layer('champagne-deep').match(/#[0-9a-f]{8}\b/gi) ?? []).map(parseHex);
      expect(deep.length, `${name}: the deep corners`).toBeGreaterThanOrEqual(2);
      const deepest = deep.reduce((a, b) => (b.a > a.a ? b : a));
      const pressed = parseHex(layer('champagne-deeper').trim());
      expect(pressed.a, `${name}: the pressed layer`).toBeGreaterThan(0);
      const label = solid(decls, 'on-champagne');
      for (const fill of ['champagne', 'champagne-hover']) {
        const r = ratio(label, solid(decls, fill));
        expect(r, `${name}: label on --${fill} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      const stops = value(cream(), `champagne-sheen-${name}`).match(/#[0-9a-f]{3,8}\b/gi) ?? [];
      expect(stops.length, `${name}: the sheen's colours`).toBeGreaterThanOrEqual(5);
      for (const stop of stops) {
        const worst = over(pressed, over(deepest, parseHex(stop).rgb));
        const r = ratio(label, worst);
        expect(r, `${name}: label on ${stop}, cornered and pressed, is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The tokens measured are the ones painted.
    const rules = css();
    const finish = String.raw`var\(--champagne-deep\),\s*linear-gradient\(var\(--champagne-angle\),\s*var\(--champagne-sheen\)\)`;
    expect(rules).toMatch(new RegExp(String.raw`\.btn--champagne\{[^}]*background-image:${finish}`));
    expect(rules).toMatch(new RegExp(String.raw`\.btn--champagne:hover\{[^}]*background-image:[^}]*${finish}`));
    expect(rules).toMatch(
      new RegExp(String.raw`\.btn--champagne:active\{[^}]*var\(--champagne-deeper\)[^}]*${finish}`),
    );
  });

  // She draws her buttons without a ring, and WCAG 1.4.11 asks nothing of a
  // text button's edge beyond its label's contrast. Every button keeps a 1px
  // border, transparent on the solid ones, so a Windows contrast theme still
  // draws the box. No rule on any class a button carries takes it away: no
  // style of none, no width of zero, no shorthand without a line style.
  it('keeps a border on every button for forced colours', () => {
    const all = css();
    expect(all).toMatch(/\.btn\{[^}]*border:1px solid/);
    // The minifier writes transparent as #0000.
    expect(all).toMatch(/\.btn--solid\{[^}]*border-color:(?:transparent|#0000(?:0000)?)[;}]/);
    expect(buttonClasses().size).toBeGreaterThan(5);
    // A rule can reach a button by one of its classes, or as the subject of a
    // selector that ends in a bare a, button or * under a class, which ranks
    // with .btn or above it.
    const reaches = (selector: string) =>
      namesAButtonClass(selector) ||
      selector
        .split(',')
        .some(
          (part) =>
            /[.[#]/.test(part) &&
            /(?:^|[\s>+~])(?:(?:a|button|\*)(?:\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?)*|(?:\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?)+)$/.test(
              part.trim(),
            ),
        );
    const side = String.raw`(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?`;
    const removed = new RegExp(String.raw`(?:^|;)border${side}(?:-width)?:(?:none|hidden|0)(?=[\s;]|$)`);
    const noStyle = new RegExp(
      String.raw`(?:^|;)border${side}-style:[^;]*\b(?:none|hidden|initial|unset|revert(?:-layer)?)\b`,
    );
    const style = /\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\b/;
    for (const [selector, body] of cssRules()) {
      if (!reaches(selector)) continue;
      expect(body, selector).not.toMatch(removed);
      expect(body, selector).not.toMatch(noStyle);
      expect(body, selector).not.toMatch(/(?:^|;)all:/);
      for (const [, value] of body.matchAll(new RegExp(String.raw`(?:^|;)border${side}:([^;]+)`, 'g'))) {
        expect(value, `${selector} border:${value}`).toMatch(style);
      }
    }
  });

  // On paper a button on the page is its outline and its words in ink, as
  // most printers drop backgrounds; one on a plate prints as the plate does.
  it('prints a button on the page as an ink outline, and leaves the plates alone', () => {
    const printed = cssRules().filter(([selector]) => selector === '.btn--solid:not(.plate *)');
    expect(printed.length).toBe(1);
    const [[, body]] = printed;
    expect(body).toMatch(/(?:^|;)color:var\(--ink\)/);
    expect(body).toMatch(/(?:^|;)border-color:currentColor/i);
    expect(body).toMatch(/(?:^|;)background:(?:none|0 0)(?=;|$)/);
    expect(body).toMatch(/(?:^|;)box-shadow:none(?=;|$)/);
    expect(css()).toMatch(/@media print\{[^@]*\.btn--solid:not\(\.plate \*\)\{/);
  });

  // The end icon sits at the inline end, so the button reads right in either
  // direction; the consultation submit is wide enough for both its words, so
  // it keeps its size while it sends.
  it('places the end icon logically, and holds the consultation submit width', () => {
    const icon = cssRules()
      .filter(([selector]) => selector === '.btn--end-icon>svg')
      .map(([, body]) => body)
      .join(';');
    expect(icon).toMatch(/(?:^|;)inset-inline-end:/);
    expect(icon).not.toMatch(/(?:^|;)(?:left|right|inset):/);
    // Every rule on the consultation submit that sets a floor sets this one.
    const floors = cssRules().filter(([selector]) => /\.form__foot \.btn$/.test(selector));
    expect(floors.some(([, body]) => /(?:^|;)min-width:10\.5em(?=;|$)/.test(body))).toBe(true);
    for (const [selector, body] of floors) {
      for (const [, value] of body.matchAll(/(?:^|;)min-width:([^;]+)/g)) expect(value, selector).toBe('10.5em');
    }
  });

  // What separates a form field from the page has to clear 3:1, on every
  // surface a form sits on.
  it('gives form fields an edge that clears 3:1', () => {
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
    // Set inline, on the element, by the component that reads it: the
    // monogram's size, where the sign is in the homepage photo. Read from the
    // pages, so a name the component misspells is still missing.
    const inline = new Set(
      allPages().flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/ style="([^"]*)"/g)].flatMap(([, style]) =>
          [...style.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
        ),
      ),
    );
    expect([...inline]).toEqual(expect.arrayContaining(['--box', '--top', '--foot']));
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
      // In the head, so it runs before anything is painted: at the end of the
      // body a visitor who chose dark would see a cream flash on every page.
      const head = doc.match(/<head>[^]*?<\/head>/)?.[0] ?? '';
      expect(head, route).toContain("localStorage.getItem('llt-theme') === 'dark'");
      expect(doc, route).not.toContain('prefers-color-scheme');
      expect(doc, route).not.toMatch(/<html[^>]*data-theme/);
    }
    // Nor may the stylesheet switch on it behind the page's back.
    expect(css()).not.toContain('prefers-color-scheme');
  });

  // A phone set to force every page dark (Chrome on Android does it) leaves a
  // page alone when its scheme says "only". Dark stays the visitor's choice.
  it('opts the cream theme out of a forced dark mode', () => {
    // The keyword may sit on either side; the minifier writes it second.
    expect(cream()).toMatch(/(?:^|;)color-scheme:(?:only light|light only)(?:;|$)/);
    expect(dark()).toMatch(/(?:^|;)color-scheme:dark(?:;|$)/);
  });

  // Pulled past its top or its end, a phone shows the canvas behind the page.
  // It is the black of the bars, so the header and the footer run to the edge
  // of the screen, and the body lays the cream over it.
  it('paints the canvas in the black of the bars, and the page over it', () => {
    expect(block('html')).toMatch(/(?:^|;)background:var\(--bar\)(?:;|$)/);
    expect(block('body')).toMatch(/(?:^|;)background:var\(--bg\)(?:;|$)/);
    expect(block('body')).toMatch(/(?:^|;)min-height:100svh(?:;|$)/);
  });

  // The toggle is a script. Without one it is hidden rather than left dead.
  it('hides the theme toggle when there is no JavaScript', () => {
    const doc = html('/ja');
    expect(doc).toMatch(
      /<noscript><style>\[data-theme-toggle\]\{display:none!important\}<\/style><\/noscript>/,
    );
    // The rule hides nothing unless the buttons carry the attribute it names:
    // one in the bar, one in the phone menu.
    expect(count(doc, /<button[^>]*data-theme-toggle/g)).toBe(2);
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
  // over the content, and her brief asks for no floating EN in the way.
  // The one thing pinned over a page is her own plan-page phone bar (10A 04),
  // which shows only once the price card's button has gone above the screen
  // and until her closing panel comes up, and sits at the foot of the screen,
  // away from the language link in the header.
  it('pins nothing over the page but her plan bar', () => {
    const pinned = [...css().matchAll(/([^{}]+)\{[^{}]*position:fixed/g)].map((m) => m[1].trim());
    expect(pinned.length).toBeGreaterThan(0);
    for (const selector of pinned) {
      expect(selector).toMatch(/^\.plan-bar\[data-astro-cid-[^\]]+\]:not\(\[hidden\]\)$/);
    }
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
      // Named once, by its title, which a mouse also shows: a title and an
      // aria-label both were read out twice.
      for (const a of anchors) {
        expect(a, route).toMatch(/title="[^"]+"/);
        expect(a, route).not.toMatch(/aria-label=/);
      }
      expect(links).toContain('href="mailto:losangelesluxurytour@gmail.com"');
      expect(links).toContain('href="https://www.instagram.com/losangelesluxurytour/"');
      expect(footer(route)).not.toContain('line.me');
      expect(footer(route)).not.toContain('threads.net');
    }
  });

  // Her footer, in her order: the wish, the icons, the privacy link on a row
  // of its own, then the two legal lines and nothing else.
  it('ends the footer with the privacy link and the two legal lines', () => {
    for (const [route, privacy] of [
      ['/', '/privacy'],
      ['/ja', '/ja/privacy'],
    ]) {
      const tail = footer(route).split('</nav>')[1] ?? '';
      const lines = [...tail.matchAll(/<p class="site-footer__(\w+)[^>]*>([\s\S]*?)<\/p>/g)];
      expect(lines.map(([, kind]) => kind), route).toEqual(['privacy', 'meta', 'meta']);
      expect(lines[0][2], route).toContain(`href="${privacy}"`);
      expect(lines[1][2].trim(), route).toBe('© 2026 Los Angeles Luxury Tour');
      expect(lines[2][2], route).toContain('California Seller of Travel');
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
  // A picture's own photo, and the one a media query swaps in for some
  // screens (the homepage's upright photo, for an upright phone).
  const opening = (pic: string) => pic.replace(/<source media="[^"]*"[^>]*>/g, '');
  const swapped = (pic: string) => (pic.match(/<source media="[^"]*"[^>]*>/g) ?? []).join('');

  it('offers the opening photo as AVIF, then WebP, then JPEG, and fetches it first', () => {
    const pic = picture('/');
    const types = (part: string) => [...part.matchAll(/ type="(image\/[a-z]+)"/g)].map((m) => m[1]);
    expect(types(opening(pic))).toEqual(['image/avif', 'image/webp']);
    // The swapped-in photo has no <img> of its own: its JPEG is a source.
    expect(types(swapped(pic))).toEqual(['image/avif', 'image/webp', 'image/jpeg']);
    const img = pic.match(/<img[^>]*>/)?.[0] ?? '';
    expect(img).toMatch(/src="[^"]+\.jpg"/);
    expect(img).toContain('fetchpriority="high"');
    expect(img).toContain('loading="eager"');
  });

  // A landscape photo in a tall phone hero is drawn wider than the screen. At
  // 100vw the browser fetched a 768px file and stretched it to over twice that.
  it('tells the browser the hero is drawn wider than a phone screen', () => {
    // The homepage photo is drawn by the sign on it, a little over twice as
    // tall as the words under the sign: never more than about 700px tall,
    // 1244px wide for its 1672 by 941, until the screen is wider than that.
    // An upright phone draws its upright photo the screen's width instead.
    // The Experience band is cut to 3:2 and is 32% tall: 48%.
    const sizes = (part: string) => part.match(/sizes="([^"]+)"/)?.[1] ?? '';
    expect(sizes(opening(picture('/')))).toBe('(max-width: 1244px) 1244px, 100vw');
    expect(sizes(swapped(picture('/')))).toBe('100vw');
    expect(sizes(picture('/experience'))).toBe('(max-aspect-ratio: 48/100) 48vh, 100vw');
  });

  // The homepage photo is 1672px wide and its upright one 941: each ladder
  // ends on its own photo's width, and asks for nothing wider, which would
  // only be the same pixels enlarged.
  it('never asks for more of the homepage photos than they hold', () => {
    const widths = (part: string) =>
      [...part.matchAll(/srcset="([^"]+)"/g)].map((m) =>
        m[1].split(',').map((p) => Number(p.trim().split(' ')[1].replace('w', ''))),
      );
    for (const [part, own] of [
      [opening(picture('/')), 1672],
      [swapped(picture('/')), 941],
    ] as const) {
      const sets = widths(part);
      expect(sets.length).toBe(3);
      for (const set of sets) expect(Math.max(...set)).toBe(own);
    }
  });

  // The About page opens on her golden-hour photo, fetched first. Her
  // portrait is now under it, below the first screen, so it and the coast
  // band below it load lazily: one image at high priority per page.
  it('leaves every photo that is not a page opener to load lazily', () => {
    const imgs = html('/about').match(/<img[^>]*>/g) ?? [];
    const opener = imgs.find((i) => i.includes('griffith-observatory-golden')) ?? '';
    expect(opener).toContain('loading="eager"');
    expect(opener).toContain('fetchpriority="high"');
    for (const file of ['portrait', 'malibu-cliff-house']) {
      const img = imgs.find((i) => i.includes(file)) ?? '';
      expect(img, file).toContain('loading="lazy"');
      expect(img, file).toContain('decoding="async"');
      expect(img, file).not.toContain('fetchpriority');
    }
    expect(count(html('/about'), /fetchpriority="high"/g)).toBe(1);
  });

  // Listing AVIF first only helps if it is the smaller file. With one shared
  // quality it was a quarter larger than the WebP at every width.
  it('makes the AVIF the smallest file at every width', () => {
    for (const part of [opening(picture('/')), swapped(picture('/'))]) {
      const [avif, webp, jpg] = [...part.matchAll(/srcset="([^"]+)"/g)].map((m) => files(m[1]));
      expect(avif.length).toBeGreaterThan(3);
      for (let i = 0; i < avif.length; i++) {
        const [a, w, j] = [avif[i], webp[i], jpg[i]].map((f) => statSync(f).size);
        expect(a, `${avif[i]} (${a}) vs WebP (${w})`).toBeLessThan(w);
        expect(w, `${webp[i]} (${w}) vs JPEG (${j})`).toBeLessThan(j);
      }
    }
  });
});

// Amelia's Experience page, from section 08 of her brief of 2026-11-05: a
// short hero, four icon labels, the plan cards, what lies beyond them, and
// Instagram. Her Japanese is checked character for character, in her order.
describe('the Experience page, in her order', () => {
  const HERS = [
    '決まった旅ではなく、あなたに合わせてつくる旅を。',
    '旅ができるまで',
    'ご相談',
    'プラン提案',
    'ご確認・調整',
    'ご予約・手配',
    '目的に合わせて選べる、旅のプラン',
    'プランのその先へ',
    '記念日旅行や、特別な体験など、あなたの“やりたい”をカタチにします。',
    'ご相談はこちら',
    '旅のインスピレーションはInstagramで',
    '@losangelesluxurytour',
  ];

  it('carries her copy verbatim, in her order', () => {
    const page = bare('/ja/experience');
    let from = 0;
    for (const line of HERS) {
      const at = page.indexOf(line, from);
      expect(at, `missing or out of order: ${line}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    }
  });

  // What she asked to come out, and wording that exists only in her mockup
  // image, where her written instruction says otherwise.
  it('drops what her brief removed and takes no wording from the picture', () => {
    const page = bare('/ja/experience');
    for (const gone of [
      'あなたの旅ができるまで',
      'その時の気分にも、柔軟に',
      'こんなご案内もできます',
      'プランご提案',
      'ご予約の流れ',
    ]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it('opens on a short photo band with her heading and nothing else', () => {
    for (const route of ['/experience', '/ja/experience']) {
      const hero = html(route).match(/<section class="photo-hero[^]*?<\/section>/)?.[0] ?? '';
      expect(hero, route).toContain('photo-hero--short');
      expect(count(hero, /<h1/g), route).toBe(1);
      expect(count(hero, /<p[ >]/g), `${route}: no paragraph`).toBe(0);
      expect(count(hero, /<a /g), `${route}: no button`).toBe(0);
    }
  });

  it('shows the four steps as an ordered list of icon and label, with no descriptions', () => {
    for (const route of ['/experience', '/ja/experience']) {
      const list = html(route).match(/<ol class="steps[^]*?<\/ol>/)?.[0] ?? '';
      expect(count(list, /<li class="step"/g), route).toBe(4);
      expect(count(list, /<svg/g), route).toBe(4);
      expect(count(list, /<p[ >]/g), route).toBe(0);
      // Safari stops calling a list without markers a list, so it is told,
      // and each number is text a screen reader reads.
      expect(list, route).toMatch(/^<ol class="steps[^"]*"[^>]*role="list"/);
      const numbers = [...list.matchAll(/<span class="step__n"([^>]*)>(\d)<\/span>/g)];
      expect(numbers.map(([, , n]) => n), route).toEqual(['1', '2', '3', '4']);
      for (const [, attrs] of numbers) expect(attrs, route).not.toContain('aria-hidden');
    }
  });

  // One component renders both lists, so they cannot drift apart.
  it('shows the same plans, in the same order, as the homepage', () => {
    const ids = (route: string) =>
      [...html(route).matchAll(/<(?:article|details) class="plan [^"]*" id="plan-([a-z-]+)"/g)].map(
        ([, id]) => id,
      );
    for (const prefix of ['', '/ja']) {
      expect(ids(`${prefix}/experience`), prefix).toEqual(ids(prefix || '/'));
      expect(ids(`${prefix}/experience`).length, prefix).toBe(offerings.length);
    }
  });

  // Her words: one clear inquiry call to action.
  it('has one inquiry button on the page, to the contact page', () => {
    for (const [route, contact] of [
      ['/experience', '/contact'],
      ['/ja/experience', '/ja/contact'],
    ]) {
      const main = html(route).match(/<main[^]*<\/main>/)?.[0] ?? '';
      expect(count(main, new RegExp(`href="${contact}"`, 'g')), route).toBe(1);
    }
  });

  it('ends on a compact Instagram strip: one link, her line and the handle', () => {
    for (const route of ['/experience', '/ja/experience']) {
      const strip = html(route).match(/<section class="section section--deep ig[^]*?<\/section>/)?.[0] ?? '';
      expect(count(strip, /<a /g), route).toBe(1);
      expect(strip, route).toContain('href="https://www.instagram.com/losangelesluxurytour/"');
      expect(strip, route).toContain('@losangelesluxurytour');
      expect(count(strip, /<img/g), `${route}: no made-up gallery`).toBe(0);
    }
  });

  // She asked for the exchange rate to go. The figures it explained are
  // untouched until her fixed prices arrive.
  it('prints no exchange rate on any page', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        expect(bare(prefix + p), prefix + p).not.toMatch(/163円|¥163|\$1=/);
      }
    }
  });
});

// Amelia's About page, from section 09 of her brief of 2026-11-05: five short
// parts where there were seven long ones.
describe('the About page, in her five parts', () => {
  const HERS = [
    '贅沢とは、人生の価値になる体験。',
    '旅の価値は、訪れた場所の数ではなく、そこでどんな時間を過ごしたか。',
    '一人ひとりの希望に寄り添い、心に残るロサンゼルスの旅をお届けします。',
    '旅を愛してきたからこそ、届けたい時間があります。',
    '日本で育ち、現在は南カリフォルニアで暮らしています。',
    'これまでに訪れたさまざまな国で、心に残るホスピタリティや、旅がもたらす特別な時間を体験してきました。',
    '華やかさだけでなく、さりげない心配りや心地よさを大切にし、安心して楽しめる旅をご案内しています。',
    '行き先だけでなく、過ごし方まで、あなたらしく。',
    '観光地を巡るだけでなく、あなたのペースやご希望に合わせて、ロサンゼルスの魅力を深く感じられる旅をご提案します。',
    '現地のリアルな情報と、日本語でのきめ細やかなサポートで、初めての方でも安心してお楽しみいただけます。',
    'BoldJourney',
    '代表者インタビュー掲載',
    '記事を読む',
    'あなただけのロサンゼルスを。',
    '旅のご相談はこちら',
  ];

  it('carries her copy verbatim, in her order', () => {
    const page = bare('/ja/about');
    let from = 0;
    for (const line of HERS) {
      const at = page.indexOf(line, from);
      expect(at, `missing or out of order: ${line}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    }
  });

  // Her name line, 「Amelia Kay Perrin | Founder」, under her portrait. The bar
  // is a separator and is hidden from a screen reader.
  it('names the founder as she wrote it, under her portrait', () => {
    for (const route of ['/about', '/ja/about']) {
      const figure = html(route).match(/<figure class="founder__figure[^]*?<\/figure>/)?.[0] ?? '';
      expect(count(figure, /<img /g), route).toBe(1);
      // What the eye reads, with the screen reader's separator taken out.
      const seen = figure.replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, '');
      expect(seen.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), route).toBe(
        'Amelia Kay Perrin | Founder',
      );
      // The bar is decoration; a screen reader gets a comma in its place, so
      // the two halves do not run together as "PerrinFounder".
      expect(figure, route).toMatch(
        /<span class="sr-only"[^>]*>, <\/span>\s*<span class="founder__bar"[^>]*aria-hidden="true"/,
      );
      // The caption names her, so the alt says what the picture is.
      expect(figure, route).not.toMatch(/<img [^>]*alt="[^"]*(?:Amelia|アメリア)/);
    }
  });

  // What her new structure has no place for. All of it is in the tag round-2.
  it('drops the parts her brief replaced', () => {
    const page = bare('/ja/about');
    for (const gone of [
      'OURSTORY',
      'PARTNERSHIP',
      '私たちが考えるLuxuryとは',
      '人が喜ぶ瞬間を',
      'ミヤネ屋',
      'パートナーシップのお問い合わせ',
      '英語記事',
    ]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  // She names the parts in English, in both languages. On the Japanese page
  // they are marked as English, so a screen reader says them as English.
  it('labels the parts in English, marked as English on the Japanese page', () => {
    const ja = html('/ja/about');
    for (const label of ['About us', 'Founder', 'The experience', 'Media &amp; press']) {
      expect(ja, label).toMatch(new RegExp(`class="kicker[^"]*"[^>]*lang="en"[^>]*>${label}<`));
      expect(html('/about'), label).toContain(`>${label}<`);
    }
  });

  // Her opening (09): the words set left in dark ink on a golden-hour sky,
  // the observatory, palms and skyline under them. The photo is light sky
  // left of the palms and above the skyline, so the words stay there: under
  // 960px they sit on the photo's own sky colour and the photo follows,
  // fading in at its top; from 960px it fills the section from behind and
  // the words, 30em at most from the column's left edge, stand in its sky.
  // Her label takes a deeper gold on that sky; in the dark theme the band is
  // the page's black and the photo dims under the light words.
  it('opens on her golden-hour photo, with the words set left in its sky', () => {
    for (const route of ['/about', '/ja/about']) {
      const head = html(route).match(/<section class="section head"[^]*?<\/section>/)?.[0] ?? '';
      expect(head.indexOf('<h1'), route).toBeGreaterThan(-1);
      expect(head.indexOf('<picture'), 'the photo after the words').toBeGreaterThan(head.indexOf('<h1'));
      const img = head.match(/<img [^>]*>/)?.[0] ?? '';
      expect(img, route).toContain('class="head__photo"');
      expect(img, route).toMatch(/\/_astro\/griffith-observatory-golden\./);
      expect(img, route).toContain('loading="eager"');
      expect(head, route).toMatch(/<p class="kicker kicker--bar"[^>]*>About us</);
      expect(head, `${route}: nothing centred`).not.toMatch(/class="[^"]*\bcenter\b/);
    }
    // Every rule below is the About page's own, by its scope.
    const cid = html('/about').match(/<section class="section head"[^>]* data-astro-cid-(\w+)/)?.[1];
    expect(cid, "the About page's scope").toBeTruthy();
    const rule = (selector: string, from = css()) =>
      [...from.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, s]) => s.trim() === selector.replace(/@/g, `[data-astro-cid-${cid}]`))
        .flatMap(([, , body]) => body.split(';'));
    const outside = (needle: RegExp) =>
      css().replace(/@media print\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').match(needle) !== null;
    const narrow = within(/^\((?:max-width:\s?959px|width<=959px)\)$/);
    const wide = within(/^\((?:min-width:\s?960px|width>=960px)\)$/);

    // The band and the stacking it needs, outside the print rules, which
    // repeat the band for a printed dark page. Top to bottom, which the
    // minifier writes without its angle.
    const head = rule('.head@');
    expect(head).toEqual(expect.arrayContaining(['isolation:isolate', 'position:relative', 'overflow:hidden']));
    expect(head.join(';')).toMatch(/background:linear-gradient\((?:180deg,\s?)?#dcdde9,\s?#ccd2e4\)/);
    expect(outside(new RegExp(String.raw`\.head\[data-astro-cid-${cid}\]\{[^}]*isolation:isolate[^}]*background:linear-gradient`))).toBe(true);
    // A short fade on the cream keeps the palm crown crisp; a longer one on
    // the black under 960px, where a short one shows as a grey step.
    expect(rule('.head__photo@').join(';')).toMatch(/mask-image:linear-gradient\((?:180deg,\s?)?(?:transparent|#0000),\s?#000 10%\)/);
    expect(rule('html[data-theme=dark] .head__photo@', narrow).join(';')).toMatch(
      /mask-image:linear-gradient\((?:180deg,\s?)?(?:transparent|#0000),\s?#000 25%\)/,
    );
    expect(rule('html[data-theme=dark] .head__photo@')).toContain('filter:brightness(.3)');
    // From 960px: behind the words, held at its right, the words at most
    // 30em wide, and her Japanese lead folding where she folds it.
    expect(rule('.head__photo@', wide)).toEqual(
      expect.arrayContaining(['position:absolute', 'z-index:-1', 'object-fit:cover', 'object-position:100% 70%', 'mask-image:none']),
    );
    expect(rule('.head__text@', wide)).toContain('max-width:30em');
    expect(rule('html[lang=ja] .head__lead@', wide)).toContain('text-wrap:balance');
    // Her rule where her swash is, between the headline and the lead.
    for (const route of ['/about', '/ja/about']) {
      const section = html(route).match(/<section class="section head"[^]*?<\/section>/)?.[0] ?? '';
      expect(section, route).toMatch(/<\/h1>\s*<span class="rule"[^>]*><\/span>\s*<p class="body head__lead"/);
    }
    // Her gold label: 4.5:1 on both ends of the band, worked out, not
    // pinned; the page's own gold falls under it. A printed dark page,
    // which brings the band back, takes the same gold.
    const gold = rule('html:not([data-theme=dark]) .head@').find((d) => d.startsWith('--gold-text:'))?.split(':')[1] ?? '';
    for (const stop of ['#dcdde9', '#ccd2e4']) {
      expect(ratio(parseHex(gold).rgb, parseHex(stop).rgb), `label on ${stop}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(solid(cream(), 'gold-text'), parseHex('#ccd2e4').rgb), "the page's gold").toBeLessThan(4.5);
    const printed = within(/^print$/);
    expect(rule('html[data-theme=dark] .head@', printed)).toContain(`--gold-text:${gold}`);
  });

  // Her part names (09): ABOUT US after a short gold bar; FOUNDER and THE
  // EXPERIENCE between two gold hairlines, with no rule under them. The
  // experience is set left, as is the founder's heading.
  it('marks her part names with her gold bar and hairlines', () => {
    for (const route of ['/about', '/ja/about']) {
      const doc = html(route);
      for (const label of ['Founder', 'The experience']) {
        const tag = doc.match(new RegExp(`<p class="kicker kicker--lined"[^>]*>${label}</p>\\s*(<[^>]+>)`));
        expect(tag, `${route}: ${label}`).not.toBeNull();
        expect(tag?.[1], `${route}: ${label}, no rule after it`).not.toMatch(/class="rule/);
      }
      // Nothing between the page and the experience text centres it.
      const main = doc.match(/<main[^]*<\/main>/)?.[0] ?? '';
      const upTo = main.slice(0, main.indexOf('exp__title'));
      const section = upTo.slice(upTo.lastIndexOf('<section'));
      expect(section, route).not.toMatch(/class="[^"]*\bcenter\b/);
      expect(main.slice(0, main.indexOf('founder__title')), route).not.toMatch(/<div class="founder[^"]*\bcenter\b/);
    }
    // Borders, which print where backgrounds do not, spaced by margins, which
    // Safari before 14.1 keeps where it has no flex gap; the second hairline
    // comes in by the label's trailing tracking.
    expect(block('.kicker--bar:before')).toMatch(/(?:^|;)border-left:2px solid var\(--gold-deco\)/);
    expect(block('.kicker--bar:before')).toMatch(/(?:^|;)margin-right:10px/);
    for (const side of ['before', 'after']) {
      expect(block(`.kicker--lined:${side}`)).toMatch(/(?:^|;)border-top:1px solid var\(--gold-deco\)/);
    }
    expect(block('.kicker--lined:before')).toMatch(/(?:^|;)margin-right:14px/);
    expect(block('.kicker--lined:after')).toMatch(/(?:^|;)margin-left:calc\(14px - \.2em\)/);
    expect(block('.kicker--bar') + block('.kicker--lined'), 'no flex gap').not.toMatch(/(?:^|;)gap:/);
    expect(css()).not.toMatch(/\.founder__title\[data-astro-cid-[^\]]+\]\{[^}]*text-align:center/);
  });

  it('follows the founder with one full-width photo, cut to a band', () => {
    for (const route of ['/about', '/ja/about']) {
      const band = html(route).match(/<div class="band"[^]*?<\/div>/)?.[0] ?? '';
      expect(count(band, /<img /g), route).toBe(1);
      expect(band, route).toMatch(/<img [^>]*alt="[^"]+"/);
      const [, w, h] = band.match(/<img [^>]*width="(\d+)" height="(\d+)"/) ?? [];
      expect(Number(w) / Number(h), route).toBeCloseTo(2.5, 1);
    }
  });

  it('shows one media credit with its article, and ends on one gold button', () => {
    for (const [route, contact] of [
      ['/about', '/contact'],
      ['/ja/about', '/ja/contact'],
    ]) {
      const doc = html(route);
      expect(count(doc, /<li class="press__item"/g), route).toBe(1);
      expect(doc, route).toContain('href="https://boldjourney.com/meet-amelia-perrin/"');
      expect(doc, route).not.toContain('fbclid');
      const main = doc.match(/<main[^]*<\/main>/)?.[0] ?? '';
      expect(count(main, /class="btn[ "]/g), route).toBe(1);
      expect(main, route).toMatch(new RegExp(`<a class="btn btn--solid[^"]*" href="${contact}"`));
    }
  });

  // Her ending (09): the line and the button on a sunset sky, the downtown
  // skyline under them running straight into the black footer. The photo
  // says nothing the line does not, so its alt is empty, and it is below the
  // fold, so it loads lazily. It is held at its foot, and the section runs a
  // seventh of the width and a little sky past the button, which keeps the
  // words above the first tower; in the dark theme the sky dims.
  it('ends on her sunset skyline, straight into the footer', () => {
    for (const route of ['/about', '/ja/about']) {
      const main = html(route).match(/<main[^]*<\/main>/)?.[0] ?? '';
      const closing = main.match(/<section class="section closing"[^]*?<\/section>/)?.[0] ?? '';
      expect(closing, route).toContain('class="h2 h2--statement"');
      expect(closing.indexOf('<picture'), 'the photo after the words').toBeGreaterThan(closing.indexOf('closing__cta'));
      const img = closing.match(/<img [^>]*>/)?.[0] ?? '';
      expect(img, route).toMatch(/\/_astro\/downtown-skyline-apricot\./);
      expect(img, route).toContain('class="closing__photo"');
      expect(img, route).toMatch(/ alt(?:="")? /);
      expect(img, route).toContain('loading="lazy"');
      // The last part of the page, so the footer follows it.
      expect(main.lastIndexOf('<section'), route).toBe(main.indexOf(closing));
    }
    const rules = css();
    expect(rules).toMatch(/\.closing\[data-astro-cid-[^\]]+\]\{[^}]*padding-bottom:calc\(14\.3vw \+ 24px\)/);
    // Tighter on a phone, as her strip is: 12px of sky still clears the
    // towers at 320px.
    const phone = within(/^\((?:max-width:\s?639px|width<=639px)\)$/);
    expect(phone).toMatch(
      /\.closing\[data-astro-cid-[^\]]+\]\{(?=[^}]*padding-top:28px)(?=[^}]*padding-bottom:calc\(14\.3vw \+ 12px\))[^}]*\}/,
    );
    expect(rules).toMatch(
      /\.closing__photo\[data-astro-cid-[^\]]+\]\{(?=[^}]*position:absolute)(?=[^}]*object-fit:cover)(?=[^}]*object-position:50% 100%)[^}]*\}/,
    );
    expect(rules).toMatch(/html\[data-theme=dark\] \.closing__photo\[data-astro-cid-[^\]]+\]\{filter:brightness\(\.3\)\}/);
  });

  it('keeps the nav name she chose', () => {
    expect(html('/ja/about')).toContain('>私たちについて<');
    expect(html('/ja/about')).not.toContain('アメリアについて');
    expect(html('/about')).toContain('>About us<');
  });
});

// axe cannot judge text over an image, so the page has to make it safe by
// construction. The band's gradient belongs to the text: it reaches its full
// depth exactly where the first line starts. This checks that depth against
// the worst a photograph can do, a pure white pixel, so the text clears AA
// over any photo, including the ones she has yet to send.
describe('text over a photograph', () => {
  it('darkens the photo behind the text enough for any photograph', () => {
    const rules = css();
    const ink = rules.match(/\.photo-hero\[data-astro-cid-[^\]]+\]\{[^}]*--ink:(#[0-9a-f]{3,8})/)?.[1] ?? '';
    const depth = rules.match(/(#[0-9a-f]{8}) var\(--rise\)/)?.[1] ?? '';
    expect(ink, 'the ink over the photo').not.toBe('');
    expect(depth, 'the gradient stop where the text starts').not.toBe('');
    const behind = over(parseHex(depth), [255, 255, 255]);
    expect(ratio(parseHex(ink).rgb, behind)).toBeGreaterThanOrEqual(4.5);
    // That stop is one --rise down the box, and the text has to start there
    // and not above it: the box's top padding is the same --rise.
    expect(rules).toMatch(
      /\.photo-hero__inner\[data-astro-cid-[^\]]+\]\{[^}]*padding-top:var\(--rise\)/,
    );
  });

  // And no deeper than that: her picture shows the hillside through it (01).
  // Nothing under the first line is darker than the stop at it, and it is a
  // warm brown, as her picture is, not a grey.
  it('darkens the photo no more than the text needs, in a warm brown', () => {
    const rules = css();
    const ink = rules.match(/\.photo-hero\[data-astro-cid-[^\]]+\]\{[^}]*--ink:(#[0-9a-f]{3,8})/)?.[1] ?? '';
    const gradient =
      rules.match(/\.photo-hero__inner\[data-astro-cid-[^\]]+\]:before\{[^}]*background:linear-gradient\(([^;}]*)\)/)?.[1] ??
      '';
    const depth = parseHex(gradient.match(/(#[0-9a-f]{8}) var\(--rise\)/)?.[1] ?? '#0000');
    const r = ratio(parseHex(ink).rgb, over(depth, [255, 255, 255]));
    expect(r, `the ink over white at the first line is ${r.toFixed(2)}:1`).toBeLessThan(4.8);
    const stops = [...gradient.matchAll(/#[0-9a-f]{8}/gi)].map((m) => parseHex(m[0]));
    expect(stops.length).toBeGreaterThan(2);
    for (const stop of stops) expect(stop.a).toBeLessThanOrEqual(depth.a);
    const [red, green, blue] = depth.rgb;
    expect(red > green && green > blue, `rgb ${depth.rgb.join(', ')}`).toBe(true);
  });

  // On paper a browser drops backgrounds, and a plate's ink is light: the
  // header and the footer's registration line would print white on white.
  it('prints a plate as it looks on screen', () => {
    expect(css()).toMatch(/@media print\{[^@]*\.plate\{[^}]*print-color-adjust:exact/);
  });

  it('puts every photo band on a plate, so its text takes the light ink', () => {
    for (const route of ['/', '/ja', '/experience', '/ja/experience']) {
      expect(html(route), route).toMatch(/<section class="photo-hero plate /);
    }
  });
});

// Where a Japanese line may fold is decided at build time, by a phrase model
// and by ICU's dictionary, and either can change under us: a BudouX release, a
// Node upgrade. The folds are part of her copy, so they are pinned here. A
// change shows up as a diff of this file to read and accept, not as a line
// that quietly moved on the site. ' | ' is a fold, ' // ' a line break, and
// ‿ a word joiner, which holds a phrase together and is otherwise invisible.
describe('Japanese line folds', () => {
  // Every page the build writes (allPages, above): the not-found pages too,
  // and the English pages, whose only Japanese is the offer to read the page
  // in Japanese.
  it('folds every line where it did when this was last reviewed', async () => {
    const lines = new Set<string>();
    for (const file of allPages()) {
      for (const [, inner] of readFileSync(file, 'utf8').matchAll(
        /<span class="phrases"[^>]*>([^]*?)<\/span>/g,
      )) {
        lines.add(
          inner
            .replace(/<wbr[^>]*>/g, ' | ')
            // A label's folds are U+200B (see Phrases.astro): folds all the same.
            .replace(/\u200b/g, ' | ')
            .replace(/<br[^>]*>/g, ' // ')
            .replace(/\u2060/g, '‿')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        );
      }
    }
    expect(lines.size).toBeGreaterThan(20);
    await expect([...lines].sort().join('\n') + '\n').toMatchFileSnapshot(
      './__snapshots__/japanese-folds.txt',
    );
  });
});

describe('output hygiene', () => {
  // What a search result or a LINE link preview shows. Wording she took off
  // the site must not live on there.
  it('keeps retired wording out of every page head', () => {
    for (const p of PATHS) {
      for (const prefix of ['', '/ja']) {
        const head = html(prefix + p).match(/<head>[^]*?<\/head>/)?.[0] ?? '';
        expect(head, prefix + p).not.toBe('');
        expect(head, prefix + p).not.toContain('安全＆安心');
        expect(head, prefix + p).not.toContain('メニューから選ぶ旅ではなく');
      }
    }
  });

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
          `href="${localized(`/book/${o.id}`, prefix)}"`,
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
          `href="${localized(`/book/${j.slug}`, prefix)}"`,
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

  it('lists every plan in the consultation form, and on the way to booking, in the right language', () => {
    for (const [prefix, locale] of [['', 'en'], ['/ja', 'ja']] as const) {
      const consult = html(prefix + '/consult');
      const book = bare(prefix + '/book');
      for (const o of offerings) {
        // Scoped styles put a data-astro-cid attribute between the two.
        expect(consult, `${prefix}/consult ${o.id}`).toContain(`<option value="${o.id}"`);
        expect(consult, `${prefix}/consult ${o.id}`).toContain(`>${o.name[locale]}</option>`);
        expect(book, `${prefix}/book ${o.id}`).toContain(o.name[locale].replace(/\s+/g, ''));
      }
    }
  });
});

describe('the contact page chooses', () => {
  it('shows her heading and the two paths, in Japanese', () => {
    const page = bare('/ja/contact');
    const doc = html('/ja/contact');
    expect(page).toContain('ロサンゼルスで、どんな時間を過ごしたいですか？');
    expect(page).toContain('プランがお決まりの方');
    expect(page).toContain('まだプランがお決まりでない方');
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

  // Her brief, section 07: the booking and consultation choices and the FAQ
  // stay exactly as she wrote them. Only the layout around them changed.
  it('leaves her path copy and her eight questions as she wrote them', () => {
    const page = bare('/ja/contact');
    for (const line of [
      'ご旅行の予定がまだ固まっていなくても大丈夫です。ご希望や気になることから、お気軽にご相談ください。通常24時間以内にご返信いたします。',
      'ご希望の日程・人数などを入力してお申し込みください。',
      'オーダーメイドのご希望や、プランについてのご相談はこちらから。',
      '1名でも利用できますか？',
      '空港到着後やホテル出発でも利用できますか？',
      '行き先は自由に決められますか？',
      'スーツケースを持ったまま観光できますか？',
      '当日に行き先やプランを変更できますか？',
      '英語が話せなくても大丈夫ですか？',
      'ツアー料金以外にかかる費用はありますか？',
      'キャンセル料はかかりますか？',
    ]) {
      expect(page, line).toContain(line.replace(/\s+/g, ''));
    }
    expect(count(html('/ja/contact'), /<details class="faq__item/g)).toBe(8);
  });

  // The three stacked cards became one row of three links. All three ways to
  // write are still there, each going where it went before, each with a name.
  it('offers LINE, email and Instagram in one compact row', () => {
    for (const route of ['/contact', '/ja/contact']) {
      const doc = html(route);
      const row = doc.match(/<ul class="direct__list"[^]*?<\/ul>/)?.[0] ?? '';
      const links = row.match(/<a [^>]*>/g) ?? [];
      expect(links.length, route).toBe(3);
      expect(links[0], route).toContain('href="https://line.me/R/ti/p/@153cqwqp"');
      expect(links[1], route).toContain('href="mailto:losangelesluxurytour@gmail.com"');
      expect(links[2], route).toContain('href="https://www.instagram.com/losangelesluxurytour/"');
      for (const link of links) expect(link, route).toMatch(/aria-label="[^"]+"/);
      expect(doc, route).not.toContain('class="channel');
    }
    expect(bare('/ja/contact')).toContain('直接ご連絡をご希望の方へ');
  });

  // With the footer down to icons, this page is the one place the LINE ID and
  // the address can be read. A link alone is not enough: the ID is how she is
  // added from another device, and a mailto does nothing without a mail app.
  it('prints the LINE ID and the email address as text, not only as links', () => {
    for (const route of ['/contact', '/ja/contact']) {
      const ids = html(route).match(/<dl class="direct__ids"[^]*?<\/dl>/)?.[0] ?? '';
      const values = [...ids.matchAll(/<dd[^>]*>([^<]*)<\/dd>/g)].map(([, value]) => value.trim());
      expect(values, route).toEqual(['@153cqwqp', 'losangelesluxurytour@gmail.com']);
    }
  });
});

// Amelia's plan page, from section 10A of her brief of 2026-11-05, drawn for
// the Dodgers transfer and meant for every plan.
describe('her plan page, in her order', () => {
  const page = '/experience/dodgers-transfer';
  // The text a visitor sees inside <main>: the <title> repeats the plan's
  // name, and would satisfy a search before the heading did.
  const seen = (route: string) =>
    (html(route).match(/<main[^]*<\/main>/)?.[0] ?? '')
      .replace(/<script[^]*?<\/script>|<style[^]*?<\/style>/g, '')
      .replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\s\u200b\u2060]+/g, '');

  const HERS = [
    'Dodgers game transfer',
    'ドジャース観戦プライベート送迎',
    '試合前から試合終了後まで。日本語対応の完全貸切送迎で、ドジャース観戦をもっと快適に。',
    '完全貸切',
    '1〜4名様',
    '日本語対応',
    '片道送迎',
    '49,800円 ／1組',
    '往復送迎',
    '79,800円 ／1組',
    '1組あたりの料金・定員4名様',
    'このプランを申し込む',
    'まずは相談する',
    'The experience',
    '観戦を、もっと自由に。もっと快適に。',
    '大切な試合の日を、移動の心配なく楽しんでいただくために。ご宿泊先とドジャースタジアム間を、プライベート車両でご案内します。',
    'サービス内容',
    'ご宿泊先⇔ドジャースタジアムの送迎',
    '試合終了後のお迎え（往復・復路）',
    '日本語での連絡・当日のサポート',
    'ご利用について',
    '送迎エリア',
    'ロサンゼルス市内・近郊',
    'ご利用人数',
    '1〜4名様',
    '料金補足・追加料金',
    '当日のご案内・注意事項',
    '完全予約制',
    '特別な観戦の一日を。',
    'このプランを申し込む',
  ];

  it('carries her copy verbatim, in her order', () => {
    const text = seen('/ja' + page);
    let from = 0;
    for (const line of HERS) {
      const at = text.indexOf(line.replace(/\s+/g, ''), from);
      expect(at, `missing or out of order: ${line}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    }
  });

  // One line where it fits at the shared heading size, her break where it
  // does not, and never a smaller size to force it.
  it('folds the title at her break and nowhere else, at the shared heading size', () => {
    const h1 = html('/ja' + page).match(/<h1 [^>]*>[^]*?<\/h1>/)?.[0] ?? '';
    expect(h1).toMatch(/^<h1 class="h2 /);
    expect(h1).toMatch(/<span class="phrases"[^>]*>ドジャース観戦<wbr>プライベート送迎<\/span>/);
  });

  it('opens on a photo, then the overview', () => {
    for (const route of [page, '/ja' + page]) {
      const main = html(route).match(/<main[^]*<\/main>/)?.[0] ?? '';
      expect(main.indexOf('<picture'), route).toBeGreaterThan(-1);
      expect(main.indexOf('<picture'), route).toBeLessThan(main.indexOf('<h1'));
      expect(main, route).toMatch(/<img [^>]*fetchpriority="high"/);
    }
  });

  // Both ways in by the price, and the request again in the closing panel;
  // the consultation link once, as her closing panel has none. The third
  // link to the form is her phone bar's.
  it('puts both actions by the price, and the request again at the end', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(prefix + page);
      expect(count(doc, new RegExp(`href="${prefix}/book/dodgers-transfer"`, 'g'))).toBe(3);
      expect(count(doc, new RegExp(`href="${prefix}/consult[?]service=dodgers-transfer"`, 'g'))).toBe(1);
      const closing = doc.match(/<section class="closing plate"[^]*?<\/section>/)?.[0] ?? '';
      expect(closing).toMatch(new RegExp(`<a class="btn btn--solid[^"]*" href="${prefix}/book/dodgers-transfer"`));
      // What her phone bar watches: the price card's button, and her panel.
      expect(count(doc, / data-plan-request/g)).toBe(1);
      expect(doc).toMatch(/<a class="btn btn--solid pricing__cta"[^>]* data-plan-request/);
      expect(closing).toMatch(/^<section class="closing plate"[^>]* data-plan-closing/);
    }
  });

  // Her optional phone bar (10A 04): her from-price and her label, off the
  // page until its script runs, and on a phone held upright only.
  it('carries her phone bar, hidden until its script shows it', () => {
    const bar = (route: string) => html(route).match(/<div class="plan-bar plate" data-plan-bar hidden[^]*?<\/div>/)?.[0] ?? '';
    const ja = bar('/ja' + page).replace(/<[^>]+>/g, '');
    expect(ja).toContain('49,800円〜 ／1組');
    expect(ja).toContain('予約リクエスト');
    expect(bar('/ja' + page)).toContain('href="/ja/book/dodgers-transfer"');
    const en = bar(page).replace(/<[^>]+>/g, '');
    expect(en).toContain('from ¥49,800 per group');
    expect(en).toContain('Booking request');
    expect(bar(page)).toContain('href="/book/dodgers-transfer"');
    // Its script, which takes it out of hidden and watches the two, is on
    // both pages: read from the script elements themselves.
    for (const route of [page, '/ja' + page]) {
      const scripts = [...html(route).matchAll(/<script\b[^>]*>([^]*?)<\/script>/g)].map((m) => m[1]);
      const watcher = scripts.filter(
        (js) => js.includes('[data-plan-bar]') && js.includes('[data-plan-request]') && js.includes('[data-plan-closing]'),
      );
      expect(watcher.length, route).toBe(1);
      expect(watcher[0], route).toContain('IntersectionObserver');
      // The button counts on the screen or below it, her panel on the
      // screen or above it; the bar re-measures itself as its size changes.
      expect(watcher[0], route).toContain('0px 0px 100000px 0px');
      expect(watcher[0], route).toContain('100000px 0px 0px 0px');
      expect(watcher[0], route).toContain('ResizeObserver');
      // The wait starts again on a scroll or a touch.
      expect(watcher[0], route).toMatch(/addEventListener\(`scroll`|addEventListener\(['"]scroll['"]/);
      expect(watcher[0], route).toMatch(/addEventListener\(`pointerdown`|addEventListener\(['"]pointerdown['"]/);
    }
    // Off by default; on a phone held upright, fixed at the foot of the
    // screen but hidden and below it until shown; never in print.
    const styles = css();
    expect(styles).toMatch(/\.plan-bar\[data-astro-cid-[^\]]+\]\{display:none\}/);
    const phone = styles.match(
      /@media \((?:max-width:\s?680px|width<=680px)\) and \((?:min-height:\s?480px|height>=480px)\)\{(\.plan-bar\[data-astro-cid-[^\]]+\]:not\(\[hidden\]\)\{[^}]*\})(\.plan-bar\[data-astro-cid-[^\]]+\]\.is-shown\{[^}]*\})/,
    );
    expect(phone).not.toBeNull();
    const [, resting, shown] = phone ?? [];
    expect(resting).toContain('position:fixed');
    expect(resting).toContain('visibility:hidden');
    expect(resting).toMatch(/transform:translateY\(100%\)/);
    // It slides in and goes at once: no transition on the way out.
    expect(resting).not.toMatch(/transition/);
    expect(shown).toContain('visibility:visible');
    expect(shown).toContain('transform:none');
    expect(shown).toMatch(/transition:transform/);
    // Lifted off the page's own black in the dark theme.
    expect(styles).toMatch(/html\[data-theme=['"]?dark['"]?\] \.plan-bar\[data-astro-cid-[^\]]+\]:not\(\[hidden\]\)\{[^}]*background:var\(--raised\)/);
    // Taps pass through it while it slides in.
    expect(styles).toMatch(/\.plan-bar\[data-astro-cid-[^\]]+\]\.is-arriving\{pointer-events:none/);
    expect(styles).toMatch(/@media print\{\.plan-bar\[data-astro-cid-[^\]]+\]\{display:none!important/);
    // The price is never squeezed under the button: the figure keeps its
    // width, and the button is what gives way.
    const price = styles.match(/\.plan-bar__price\[data-astro-cid-[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(price).not.toMatch(/min-width:0/);
    const cta = styles.match(/\.plan-bar__cta\[data-astro-cid-[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(cta).not.toMatch(/flex:none/);
    expect(cta).not.toMatch(/min-width:0/);
  });

  it('keeps the bar to her plan pages', () => {
    const own = new Set(plans.flatMap((plan) => [`/experience/${plan.slug}`, `/ja/experience/${plan.slug}`]));
    let seen = 0;
    for (const file of allPages()) {
      const route = file.slice(DIST.length).split(sep).join('/').replace(/\.html$/, '');
      if (own.has(route)) {
        expect(readFileSync(file, 'utf8'), route).toContain('data-plan-bar');
        seen++;
      } else {
        expect(readFileSync(file, 'utf8'), route).not.toContain('data-plan-bar');
      }
    }
    expect(seen).toBe(own.size);
  });

  // Her own English label from her October sample, as round 2 showed it.
  it('heads her service rows with her English label', () => {
    expect(html(page)).toMatch(/<h3 class="h3 part__title"[^>]*>Service includes<\/h3>/);
    expect(html(page)).not.toContain('What is included');
  });

  // Her October terms, kept inside the two accordions she names, with her
  // own labels; her cancellation answer is among them, from the FAQ's data.
  it('keeps her terms inside her two accordions, with her cancellation terms', () => {
    const accordions = html('/ja' + page).match(/<details class="detail"[^]*?<\/details>/g) ?? [];
    expect(accordions.length).toBe(2);
    // As read: phrases are folded with <wbr>, so the tags come out first.
    const inside = accordions.join('').replace(/<[^>]+>/g, '');
    for (const s of [
      '料金補足・追加料金',
      '【料金補足】',
      'キャンセル料はかかりますか？',
      '7日前まで：無料',
      '4日前まで：30%',
      'それ以降：100%',
      '当日のご案内・注意事項',
      '【ご利用前にご確認ください】',
      '【主な送迎エリア】',
      'ホテル以外の送迎場所もご相談可能',
      '【ご利用人数について】',
    ]) {
      expect(inside, s).toContain(s);
    }
    // The same terms as the FAQ, word for word.
    const faq = bare('/ja/contact');
    for (const tier of ['7日前まで：無料', '4日前まで：30%', 'それ以降：100%']) {
      expect(faq, tier).toContain(tier);
    }
  });

  it('shows the yen prices on the English page without the 円 character', () => {
    const doc = html(page);
    expect(doc).toContain('¥49,800');
    expect(doc).toContain('¥79,800');
    expect(doc).not.toMatch(/円/);
  });

  it('is on the list with only its lowest price', () => {
    expect(html('/ja/experience')).toContain('49,800円〜');
    expect(html('/ja/experience')).not.toContain('79,800');
    expect(html('/experience')).toContain('from ¥49,800');
  });

  // The view renders from the plan's data and the labels every plan shares,
  // so her next plan is a data entry, not a template change.
  it('keeps every plan-specific word in the data, not in the view', () => {
    const view = readFileSync(join(process.cwd(), 'src/views/PlanDetail.astro'), 'utf8')
      .replace(/\/\*[^]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(view).not.toMatch(/[぀-ヿ一-鿿]/);
  });
});

describe('the booking form', () => {
  const page = '/book/dodgers-transfer';
  // The text a visitor sees inside <main>; the <title> names the page too.
  const seen = (route: string) =>
    (html(route).match(/<main[^]*<\/main>/)?.[0] ?? '')
      .replace(/<script[^]*?<\/script>|<style[^]*?<\/style>/g, '')
      .replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\s\u200b\u2060]+/g, '');

  // Every plan has its own booking page, so the form knows its plan without
  // script; /book asks which, and an old ?service= link goes on to the page.
  it('gives every plan its own booking page, and /book asks which', () => {
    for (const prefix of ['', '/ja']) {
      const picker = html(`${prefix}/book`);
      expect(picker).toContain('location.replace(');
      for (const o of offerings) {
        expect(picker, o.id).toContain(`href="${prefix}/book/${o.id}"`);
        const doc = html(`${prefix}/book/${o.id}`);
        expect(doc, o.id).toContain('action="/api/booking"');
        expect(doc, o.id).toMatch(new RegExp(`<input type="hidden" name="service" value="${o.id}"`));
      }
    }
  });

  // Her request form (brief of 2026-11-05), her words, her order.
  it('asks for what she listed, in her order', () => {
    const text = seen('/ja' + page);
    let from = 0;
    for (const line of [
      'Booking request',
      'ご予約リクエスト',
      'ご希望の内容をお聞かせください。空き状況を確認のうえ、ご連絡いたします。',
      '選択中のプラン',
      'ドジャース観戦 プライベート送迎',
      '送迎タイプ',
      '片道送迎',
      '49,800円',
      '往復送迎',
      '79,800円',
      '送迎区間',
      'ホテル → スタジアム',
      'スタジアム → ホテル',
      'ご利用希望日',
      'ご利用人数',
      '4名様',
      '5名様以上（要相談）',
      '5名様以上の場合は、車両や料金を個別にご案内します。',
      'ご宿泊先（任意）',
      'お客様情報',
      'お名前',
      'メールアドレス',
      'LINE ID（任意）',
      'ご要望・備考（任意）',
      'ご希望の基本料金',
      '空き状況・送迎条件を確認後、正式な料金とご予約についてご案内いたします。',
      'キャンセル料はかかりますか？',
      '予約リクエストを送信する',
      'この時点では予約は確定していません。',
    ]) {
      const at = text.indexOf(line.replace(/\s+/g, ''), from);
      expect(at, `missing or out of order: ${line}`).toBeGreaterThanOrEqual(0);
      from = at + 1;
    }
  });

  // The route only for a one-way choice. It is not required in the markup,
  // so a round trip goes through without script; the Worker asks for a route
  // where one applies, and the script makes it required then.
  it('asks for the route only where it applies, and offers no choice a plan does not have', () => {
    const doc = html('/ja' + page);
    const type = doc.match(/<fieldset class="field choice"[^]*?<\/fieldset>/)?.[0] ?? '';
    expect(count(type, /<input type="radio" name="type"[^>]*required/g)).toBe(2);
    expect(type).toMatch(/value="one-way"[^>]*data-needs-route/);
    const route = doc.match(/<fieldset class="field choice route"[^]*?<\/fieldset>/)?.[0] ?? '';
    expect(count(route, /<input type="radio" name="route"/g)).toBe(2);
    expect(route).not.toMatch(/required/);
    const plain = html('/ja/book/temecula');
    for (const s of ['name="type"', 'name="route"', 'ご希望の基本料金', 'value="over"']) {
      expect(plain, s).not.toContain(s);
    }
  });

  // The form and the Worker agree on every field: a renamed field, or one no
  // longer required on the page, would have every real booking refused.
  it('names and requires every field the Worker reads', () => {
    const sub = SUBMISSIONS['/api/booking'];
    const doc = html('/ja' + page);
    for (const field of sub.fields) {
      expect(doc, field).toContain(`name="${field}"`);
    }
    for (const field of sub.required) {
      if (field === 'service') continue;
      expect(doc, field).toMatch(new RegExp(`name="${field}"[^>]*required|required[^>]*name="${field}"`));
    }
  });

  // An old /book?service=<id> goes to the plan's own page, in its language.
  it('forwards an old link to the plan page, in the same language', () => {
    for (const [prefix, query, expected] of [
      ['/ja', '?service=temecula', '/ja/book/temecula'],
      ['', '?service=dodgers-transfer', '/book/dodgers-transfer'],
      ['', '?service=nothing', ''],
    ]) {
      const script =
        html(prefix + '/book')
          .split('<script>')
          .map((chunk) => chunk.split('</script>')[0])
          .find((chunk) => chunk.includes('location.replace')) ?? '';
      let target = '';
      new Function('location', script)({ search: query, replace: (u: string) => (target = u) });
      expect(target, prefix + query).toBe(expected);
    }
  });

  // An error line describes its field only while it shows. Referenced at
  // rest, a hidden line is still read out as the field's description.
  it('describes no field by its error line at rest', () => {
    for (const p of ['/ja/book/dodgers-transfer', '/book/temecula', '/ja/consult']) {
      expect(html(p), p).not.toMatch(/aria-describedby="e-/);
    }
  });

  // Whether a field is invalid is the script's to say, from the moment it
  // runs (tests/enhance-form.test.ts). In the markup it would hide the
  // browser's own state from a visitor without script.
  it('leaves a field\'s invalid state to the browser in the markup', () => {
    for (const p of ['/ja/book/dodgers-transfer', '/book/temecula', '/ja/consult', '/consult']) {
      const tags = html(p).match(/<(input|select|textarea)\b[^>]*\brequired\b[^>]*>/g) ?? [];
      expect(tags.length, p).toBeGreaterThan(2);
      expect(html(p), p).not.toContain('aria-invalid');
    }
  });

  // Back to a form the browser no longer has cached: it puts the fields back
  // as the guest left them, hotel and LINE ID included, which autocomplete
  // off would leave out.
  it('lets the browser put every typed field back', () => {
    for (const p of ['/ja/book/dodgers-transfer', '/book/temecula']) {
      const fields = html(p).match(/<(input|textarea)\b[^>]*name="(hotel|line|notes|name|email)"[^>]*>/g) ?? [];
      expect(fields.length, p).toBe(5);
      for (const field of fields) expect(field, p).not.toContain('autocomplete="off"');
    }
  });

  // The guest's way out when a send fails: heard as it appears, on both forms.
  it('announces a failed send on both forms', () => {
    for (const p of ['/consult', '/ja/consult', '/book/temecula', '/ja/book/dodgers-transfer']) {
      expect(html(p), p).toMatch(/<p class="form__err" data-send-error hidden role="alert"[\s>]/);
    }
  });

  // The referral discount is part of the question: read with its two fields.
  it('reads the referral discount with the fields it is about', () => {
    for (const p of ['/consult', '/ja/consult']) {
      const doc = html(p);
      expect(doc, p).toMatch(/<p class="caption hint" id="h-heard"[\s>]/);
      expect(doc, p).toMatch(/id="f-heard"[^>]*aria-describedby="h-heard"/);
      expect(doc, p).toMatch(/id="f-ref"[^>]*aria-describedby="h-heard"/);
    }
  });

  // Japanese sets no half-width space after its own comma or colon.
  it('puts a link straight after a Japanese comma or colon', () => {
    // Every tag but the link's own is invisible in the line: out first, so a
    // </span> or a scoped <wbr> cannot hide a space between the two.
    // The word joiner (U+2060) holds a mark to its word and is not text.
    const seenLine = (markup: string) =>
      markup.replace(/<(?!\/?a[\s>])[^>]+>/g, '').replace(/\u2060/g, '');
    for (const p of ['/ja/book', '/ja/consult', '/ja/book/temecula']) {
      expect(seenLine(html(p)), p).not.toMatch(/[、：]\s+<a /);
    }
    const sendLine = (p: string) =>
      seenLine(html(p).match(/<p class="form__err" data-send-error[^]*?<\/p>/)?.[0] ?? '');
    for (const p of ['/ja/consult', '/ja/book/temecula']) {
      expect(sendLine(p), p).toContain('ご連絡ください：\u200b<a href="mailto:');
    }
    for (const p of ['/consult', '/book/temecula']) {
      expect(sendLine(p), p).toContain('directly at \u200b<a href="mailto:');
    }
  });

  // A price per person and one per group must not read alike.
  it('shows each price on the way to booking with its unit', () => {
    for (const locale of ['en', 'ja'] as const) {
      const text = bare(locale === 'ja' ? '/ja/book' : '/book');
      for (const o of offerings) {
        const unit = o.priceNote?.[locale];
        if (unit) expect(text, o.id).toContain((o.price[locale] + unit).replace(/\s+/g, ''));
      }
    }
  });

  it('starts the guests where the price does', () => {
    for (const p of ['/book/mansion-dinner', '/ja/book/mansion-dinner']) {
      const select = html(p).match(/<select[^>]*id="f-guests"[^]*?<\/select>/)?.[0] ?? '';
      expect(select, p).not.toContain('value="1"');
      expect(select, p).toContain('value="2"');
    }
  });

  // Her pickup hint only where there is a pickup. An attribute cannot hold
  // <wbr>, so its phrases are joined by U+200B, or Safari folds mid-word.
  it('gives each plan a notes hint that fits it, folded at its phrases', () => {
    const hint = (p: string) => html(p).match(/<textarea[^>]*placeholder="([^"]*)"/)?.[1] ?? '';
    const pickup = hint('/ja/book/dodgers-transfer');
    expect(pickup.replace(/\u200b/g, '')).toBe('送迎場所やご希望など、お気軽にお知らせください。');
    expect(pickup.split('\u200b').length).toBeGreaterThan(2);
    expect(hint('/ja/book/dodgers-ticket')).not.toContain('送迎');
    expect(hint('/book/dodgers-ticket')).not.toContain('Pickup');
    expect(hint('/book/mansion-dinner')).toContain('Pickup');
  });

  it('leaves checking to the browser when there is no script', () => {
    for (const p of ['/book/temecula', '/ja/book/dodgers-transfer', '/consult', '/ja/consult']) {
      expect(html(p), p).not.toMatch(/<form[^>]*novalidate/);
    }
  });

  it('gives her cancellation terms before the button that sends', () => {
    const doc = html('/ja' + page);
    const terms = doc.match(/<details class="terms"[^]*?<\/details>/)?.[0] ?? '';
    for (const tier of ['7日前まで：無料', '4日前まで：30%', 'それ以降：100%']) {
      expect(terms.replace(/<[^>]+>/g, ''), tier).toContain(tier);
    }
    expect(doc.indexOf('<details class="terms"')).toBeLessThan(doc.indexOf('予約リクエストを送信する'));
  });

  // Her received screen. What was sent arrives from the Worker, in place of
  // the mark, and only from a request it has checked.
  it('shows her received screen, with a place for what was sent', () => {
    const text = seen('/ja/book/received');
    for (const line of [
      'Request received',
      'お申し込みを受け付けました。',
      'ご予約リクエストありがとうございます。空き状況を確認のうえ、通常24時間以内にご連絡いたします。',
      '正式なご予約は、こちらからのご案内をもって確定いたします。',
      'ホームへ戻る',
    ]) {
      expect(text, line).toContain(line.replace(/\s+/g, ''));
    }
    expect(html('/ja/book/received')).toContain(SUMMARY_MARK);
    expect(html('/book/received')).toContain(SUMMARY_MARK);
  });

  // Her newer lines say the same thing as her October notice, so it retired.
  it('retires the old approval notice for her newer lines', () => {
    // On the text as seen: a fold mark from Phrases would split the string
    // in the markup and let the old notice back unnoticed.
    for (const p of ['/ja/book', '/ja/book/dodgers-transfer', '/ja/book/received']) {
      expect(bare(p), p).not.toContain('※ご予約は送信後');
    }
  });

  it('never calls a submitted booking confirmed', () => {
    const pages = [
      '/book',
      '/book/received',
      '/ja/book',
      '/ja/book/received',
      ...offerings.flatMap((o) => [`/book/${o.id}`, `/ja/book/${o.id}`]),
    ];
    for (const p of pages) {
      // Spaces are gone in bare(), so the English is matched without them.
      const text = bare(p);
      expect(text, p).not.toMatch(/bookingisconfirmed|reservationisconfirmed\./i);
      expect(text, p).not.toMatch(/ご予約が確定しました|予約確定/);
    }
  });
});

describe('sitemap', () => {
  const xml = () => readFileSync(join(DIST, 'sitemap.xml'), 'utf8');

  // '/404' is not one of PATHS, so it does not count against them.
  it('lists every page for search in every locale', () => {
    expect(count(xml(), /<loc>/g)).toBe(
      PATHS.filter((p) => !NOINDEX.includes(p)).length * 2,
    );
  });

  it('leaves the not-found and form pages out', () => {
    for (const p of NOINDEX) {
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

// What the full site test of round 3 found on the pages, held where a
// regression would show first.
describe('the pages, after the full site test', () => {
  // Her question asks whether it is all right NOT to speak English, and her
  // answer is yes. Asked the other way round, the yes said the opposite.
  it('asks the English question her way round, so its yes means hers', () => {
    expect(html('/contact')).toContain('Is it all right if I do not speak English?');
    expect(html('/contact')).not.toContain('Do I need to speak English?');
    expect(bare('/ja/contact')).toContain('英語が話せなくても大丈夫ですか？はい、大丈夫です。');
  });

  // Her heading for section 05: in the outline, not a paragraph.
  it('makes 完全予約制 the heading of its section', () => {
    expect(html('/ja')).toMatch(/<h2 class="reservation__title"[^>]*>完全予約制<\/h2>/);
    expect(html('/')).toMatch(/<h2 class="reservation__title"[^>]*>By reservation only<\/h2>/);
  });

  // A page inside a section marks that section's link, so a visitor on a plan
  // page or in the middle of booking still sees where they are.
  it('marks the section a page belongs to in the header', () => {
    const marked = (route: string) =>
      [...html(route).matchAll(/<a [^>]*href="([^"]+)"[^>]*aria-current="(page|true)"/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      );
    expect(marked('/ja/experience')).toContain('/ja/experience page');
    expect(marked('/ja/experience/temecula')).toContain('/ja/experience true');
    expect(marked('/experience/dodgers-transfer')).toContain('/experience true');
    expect(marked('/ja/book/dodgers-transfer')).toContain('/ja/contact true');
    expect(marked('/consult')).toContain('/contact true');
    expect(marked('/ja/thank-you')).toContain('/ja/contact true');
    expect(marked('/ja')).toEqual([]);
    // Its own link, marked as the page, and nothing else marked.
    expect(marked('/ja/about')).toContain('/ja/about page');
    expect(new Set(marked('/ja/about'))).toEqual(new Set(['/ja/about page']));
  });

  // The list draws her ※. A ※ in the text as well printed it twice.
  it('prints her reference mark once', () => {
    for (const j of journeys) {
      for (const item of j.excludes.ja) expect(item, j.slug).not.toMatch(/^※/);
    }
  });

  // The way on from a message page is its main action, solid as everywhere.
  it('makes the way on from the message pages the solid button', () => {
    for (const route of ['/thank-you', '/ja/thank-you', '/404', '/ja/404']) {
      expect(html(route), route).toMatch(/<a class="btn btn--solid"/);
    }
    for (const slug of ['temecula', 'dodgers-journey', 'mansion-dinner']) {
      expect(html(`/ja/experience/${slug}`), slug).toMatch(/<a class="btn btn--solid"[^>]*href="\/ja\/book\//);
    }
  });

  // An English-page bar for a Japanese reader: in its own landmark, closed in
  // its own language.
  it('gives the language offer its own landmark and a Japanese close', () => {
    const bar = html('/').match(/<aside class="lang-offer[^]*?<\/aside>/)?.[0] ?? '';
    expect(bar).toMatch(/aria-label="日本語版のご案内"/);
    expect(bar).toMatch(/lang="ja"/);
    expect(bar).toContain('aria-label="閉じる"');
  });

  // Printed from the dark theme, a page takes the cream ink: the same values,
  // token for token, as the cream theme itself.
  it('prints the dark theme in the cream ink', () => {
    // As checked out: Windows may give CRLF.
    const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    const block = (from: string) => {
      const start = tokens.indexOf(from);
      return tokens.slice(start, tokens.indexOf('}', start));
    };
    const values = (text: string) =>
      Object.fromEntries([...text.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const cream = values(block(':root {'));
    const print = values(block("@media print {\n  html[data-theme='dark'] {"));
    const dark = values(block("html[data-theme='dark'],\n.plate {"));
    expect(Object.keys(cream).length).toBeGreaterThan(30);
    expect(Object.keys(dark).length).toBeGreaterThan(15);
    expect(Object.keys(print).length).toBeGreaterThan(15);
    // The champagne's tint is part of the dark set: a printed page is cream.
    expect(Object.keys(dark)).toEqual(
      expect.arrayContaining(['--champagne', '--champagne-sheen', '--on-champagne']),
    );
    for (const name of Object.keys(dark)) {
      expect(print[name], name).toBe(cream[name]);
    }
    for (const [name, value] of Object.entries(print)) expect(value, name).toBe(cream[name]);
    // The luxe pass's own: the glow under the homepage photo, her paper
    // card's edge and shadow, and her two tiles.
    expect(Object.keys(print)).toEqual(
      expect.arrayContaining(['--glow', '--card-edge', '--shadow-card', '--tile', '--tile-mark', '--feature-tile']),
    );
  });
});

// What the review and the end-to-end test of the page fixes found, held
// where a regression would show first.
describe('the pages, after their own review', () => {
  // As a flex box the link dropped the space after LINE, and the ID read
  // LINE@153cqwqp: the gap puts the space back.
  it('keeps the space between LINE and its ID on the message pages', () => {
    expect(css()).toMatch(/\.line\[data-astro-cid-[^\]]+\]\{[^}]*column-gap:/);
    for (const route of ['/thank-you', '/ja/404']) {
      expect(html(route), route).toMatch(/LINE\s*<span class="line__id"/);
    }
  });

  // English reads a 12-hour clock, as the card's '9 a.m. to 6 p.m.' does.
  it('gives the English schedule 12-hour times, and keeps hers in Japanese', () => {
    const en = bare('/experience/temecula');
    for (const time of ['9:00a.m.', '11:15a.m.', '1:15p.m.', '6:00p.m.']) {
      expect(en, time).toContain(time);
    }
    expect(en).not.toMatch(/(?:1[3-9]|2[0-3]):\d\d/);
    expect(bare('/ja/experience/temecula')).toContain('13:15');
  });

  // Written as escapes in the source, where a review can see them, and
  // checked here, where a lost one would show.
  it('holds the English titles, names and items together where it should', () => {
    expect(html('/')).toContain('that\u00a0is\u00a0yours\u00a0alone.');
    expect(html('/')).toContain('Los\u00a0Angeles supports');
    expect(html('/about')).toContain('where\u00a0you\u00a0go.');
    expect(html('/experience/dodgers-journey')).toContain('In-\u2060N-\u2060Out');
    expect(html('/ja/privacy')).toContain('LINE\u00a0ID');
    expect(html('/')).toContain('award-\u2060winning');
  });

  // An English card line folds between its items, the dot ending the line
  // before, and not inside 'LAX pickup'.
  it('keeps each English card detail whole where it fits', () => {
    const items = html('/').match(/<span class="plan__item"[^>]*>[^<]*<\/span>/g) ?? [];
    expect(items.length).toBeGreaterThan(10);
    expect(items.join('')).toContain('LAX pickup\u00a0·');
    expect(css()).toMatch(/\.plan__item\[data-astro-cid-[^\]]+\]\{display:inline-block/);
  });

  // The marks the Japanese is set with stay out of what a guest copies.
  it('takes the fold marks out of copied text', () => {
    const script = html('/ja').match(/addEventListener\('copy'[^]*?<\/script>/)?.[0] ?? '';
    expect(script).toContain('[\\u200b\\u2060]');
  });

  // The label face has no Japanese, so 本文へ移動 fell to the system gothic.
  it('sets the Japanese skip link in the Japanese face', () => {
    expect(css()).toMatch(/html\[lang=['"]?ja['"]?\] \.skip-link\{font-family:var\(--font-body\)/);
  });

  // As a flex row its halves copied onto two lines and find-in-page did not
  // match across them: inline, with a real space, it is one line of text.
  it('keeps the registration line one line of text, with a real space', () => {
    for (const route of ['/', '/ja']) {
      expect(html(route), route).toMatch(/California Seller of Travel<\/span> <span class="site-footer__whole"/);
    }
    expect(css()).not.toMatch(/\.site-footer__registration\[data-astro-cid-[^\]]+\]\{[^}]*display:flex/);
  });
});

// The luxe pass (#100): what brings the pages closer to her pictures, held
// where a regression would show first.
describe('the look of her pictures', () => {
  // Her headings are set heavier than the body (01 to 10). English Cormorant
  // stays at 500.
  it('sets the Japanese headings at 600 and leaves the English ones at 500', () => {
    const rules = css();
    expect(rules).toMatch(/html\[lang=ja\] \.h2\{[^}]*font-weight:600/);
    expect(rules).toMatch(/html\[lang=ja\] \.h3\{[^}]*font-weight:600/);
    expect(rules).toMatch(/\}\.h2\{[^}]*font-weight:500/);
    expect(rules).toMatch(/\}\.h3\{[^}]*font-weight:500/);
    expect(rules).toMatch(/html\[lang=ja\] \.body\{[^}]*line-height:1\.85/);
  });

  // Her statement lines (02, 06, 09) and page titles (09, 10B) a step
  // larger, on the pages her pictures show them, and on the pages beside
  // them: the consultation form, its thank-you and the not-found page take
  // the size her booking form and its received page have. Each size comes
  // after the phone rule for every Japanese .h2 in the same sheet, so it
  // wins there.
  it('gives her statement lines and page titles their larger sizes, where she has them', () => {
    const sheet =
      readdirSync(join(DIST, '_astro'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
        .find((text) => text.includes('.h2--statement{')) ?? '';
    const phone = sheet.indexOf('{html[lang=ja] .h2{letter-spacing:.02em;font-size:21px}');
    expect(phone).toBeGreaterThan(-1);
    for (const [name, least, most] of [
      ['statement', 21, 32],
      ['page', 24, 40],
    ] as const) {
      const rule = sheet.match(new RegExp(`html\\[lang=ja\\] \\.h2--${name}\\{([^}]*)\\}`));
      expect(rule?.[1], name).toMatch(new RegExp(`font-size:clamp\\(${least}px,[^;]*,\\s?${most}px\\)`));
      expect(rule?.index ?? -1, name).toBeGreaterThan(phone);
    }
    const uses = (route: string, tag: 'h1' | 'h2', name: string) =>
      count(html(route), new RegExp(`<${tag} class="h2 h2--${name}[ "]`, 'g'));
    expect(uses('/ja', 'h2', 'statement'), 'value and closing').toBe(2);
    expect(uses('/ja/about', 'h2', 'statement'), 'experience and closing').toBe(2);
    // The contact page's title is the homepage's closing question, which she
    // draws on two lines (06): it takes the statement size, not the page one.
    expect(uses('/ja/contact', 'h1', 'statement'), 'contact title').toBe(1);
    for (const route of [
      '/ja/about',
      '/ja/book',
      '/ja/book/dodgers-transfer',
      '/ja/book/received',
      '/ja/consult',
      '/ja/thank-you',
      '/ja/404',
    ]) {
      expect(uses(route, 'h1', 'page'), route).toBe(1);
    }
    // Her break in the received title at every width: お申し込みを / 受け付けました。
    expect(css()).toMatch(/html\[lang=ja\] \.received__title\[data-astro-cid-[^\]]+\]\{max-width:13em/);
  });

  // Her cards are white paper with a warm grey edge and a soft shadow (04,
  // 07, 10A), with no gold around them: painted on the card, the edge is a
  // near-neutral line, not a gold one. Hers paints #dedbd6 to #dbd8d3 on her
  // #f4f1ec, about 1.23 to 1.26:1. The plan cards stand on the deeper cream
  // of their section and the price card on the page's own, so the edge is
  // held at both: at least 1.2:1 on the deeper one, where it is faintest,
  // and under 1.4:1 on the lighter one, where it is clearest and must still
  // read as her soft line, not a drawn one. Her reason cards keep a gold
  // edge (03).
  it('edges the cards in a warm line, not gold, except her reason cards', () => {
    const rules = css();
    expect(rules).toMatch(/\.panel\{[^}]*border:1px solid var\(--card-edge\)/);
    expect(rules).toMatch(/\.panel\{[^}]*box-shadow:var\(--shadow-card\)/);
    const painted = over(parseHex(token(cream(), 'card-edge')), solid(cream(), 'card'));
    const chroma = Math.max(...painted) - Math.min(...painted);
    expect(chroma, `the edge paints rgb ${painted.map(Math.round).join(', ')}`).toBeLessThan(12);
    const onDeep = ratio(painted, solid(cream(), 'bg-deep'));
    expect(onDeep, `the edge is ${onDeep.toFixed(2)}:1 on the deeper cream`).toBeGreaterThanOrEqual(1.2);
    const onPage = ratio(painted, solid(cream(), 'bg'));
    expect(onPage, `the edge is ${onPage.toFixed(2)}:1 on the page's cream`).toBeLessThan(1.4);
    expect(rules).toMatch(/\.reason\[data-astro-cid-[^\]]+\]\{[^}]*border-color:var\(--hairline\)/);
    expect(html('/ja')).toMatch(/<li class="reason panel"/);
    // Her flat taupe placeholder tile (04), with the monogram in white on
    // it; on paper and in a contrast theme, where the taupe is not drawn,
    // the monogram keeps its own gold rather than going white on white.
    expect(rules).toMatch(/\.plan__thumb\[data-astro-cid-[^\]]+\]\{[^}]*background:var\(--tile\)/);
    expect(token(cream(), 'tile'), 'one flat colour, as hers').toMatch(/^#[0-9a-f]{6}$/);
    expect(rules).toMatch(
      /@media print,\s?\(forced-colors:\s?active\)\{\.plan__thumb\[data-astro-cid-[^\]]+\] \.monogram img\{filter:none\}/,
    );
  });

  // Gold is kept for fine lines and marks, not ten prices down a list.
  it('sets the prices on the plan cards in ink', () => {
    expect(css()).toMatch(/\.plan__amount\[data-astro-cid-[^\]]+\]\{[^}]*color:var\(--ink\)/);
    expect(css()).not.toMatch(/\.plan__amount\[data-astro-cid-[^\]]+\]\{[^}]*color:var\(--gold/);
  });

  // Her cards stand well apart in one column (04). In two columns the gap
  // stays as narrow as it was until 960px: 4px more from 720px folded two
  // Japanese plan titles onto a second line at 768.
  it('spaces the plan cards as hers, without folding a title in two columns', () => {
    const gap = (rules: string) =>
      Number(rules.match(/\.tier__list\[data-astro-cid-[^\]]+\]\{(?:[^}]*;)?gap:(\d+)px/)?.[1] ?? NaN);
    const top = cssRules().find(([selector, body]) => /^\.tier__list\[/.test(selector) && /(?:^|;)display:grid/.test(body));
    expect(Number(top?.[1].match(/(?:^|;)gap:(\d+)px/)?.[1]), 'one column').toBe(28);
    expect(gap(within(/^\((?:min-width:\s?720px|width>=720px)\)$/)), 'two columns').toBe(16);
    expect(gap(within(/^\((?:min-width:\s?960px|width>=960px)\)$/)), 'two wide columns').toBe(24);
  });

  // The warm light under her hero (01, 02): the section under the photo
  // starts on it and fades to the page's cream. In the dark theme it is the
  // page's own black.
  it('lights the section under the homepage photo with her warm glow', () => {
    expect(css()).toMatch(
      /\.value\[data-astro-cid-[^\]]+\]\{background:linear-gradient\(180deg,\s?var\(--glow\) 0%,\s?var\(--bg\) 85%\)/,
    );
    expect(token(cream(), 'glow')).not.toBe(token(cream(), 'bg'));
    expect(token(dark(), 'glow')).toBe(token(dark(), 'bg'));
  });

  // The Hollywood photo and the ballpark are already at sunset and twilight:
  // nothing is laid over either, and no rule colours a photo.
  it('lays no wash over the homepage photo or the ballpark', () => {
    const rules = css();
    expect(rules).not.toMatch(/mix-blend-mode|--dusk/);
    expect(rules).not.toMatch(/\.(?:photo-hero__img|hero__photo)[^{}]*\{[^}]*filter:/);
    for (const route of ['/', '/ja']) {
      const hero = html(route).match(/<section class="(photo-hero [^"]*)"/)?.[1] ?? '';
      expect(hero.split(' ').sort(), route).toEqual([
        'photo-hero',
        'photo-hero--landmark',
        'photo-hero--tall',
        'photo-hero--upright',
        'plate',
      ]);
    }
    for (const prefix of ['', '/ja']) {
      expect(html(`${prefix}/experience/dodgers-transfer`), prefix).toMatch(/<div class="hero" data-astro-cid-/);
    }
  });

  // The homepage's first screen with its landscape photo: wider than a
  // phone, on its side, or narrower than 560px but not upright (an upright
  // phone has a photo of its own, next, with air of its own). The label has
  // air under the sign's legs, as her hillside gives it (01), one token, set
  // once, wherever the photo is sized or placed by it. Wider than a phone
  // the sky over the sign is kept to its least, so the hero stays nearer
  // half a laptop's screen, and the sign's row is sized for the photo as it
  // is drawn there, so that sky is really there. A phone on its side drops
  // the sign's row and the floor, frames the sunset and the skyline in place
  // of the sign the words would cover, and trims the gradient's rise and
  // the space under the button, so the button is in the first view. Safari
  // before 15.4 has no svh: plain values, in a block the minifier cannot
  // fold away.
  it('gives the label air under the sign, and keeps the button in the first view', () => {
    const rules = css();
    const own = (selector: string, from = rules) =>
      [...from.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, s]) => s.trim().replace(/\[data-astro-cid-[^\]]+\]/g, '') === selector)
        .map(([, , body]) => body)
        .join(';');
    const clear = Number(own('.photo-hero--landmark').match(/(?:^|;)--clear:(\d+)px/)?.[1]);
    expect(clear, 'the air under the sign').toBeGreaterThanOrEqual(12);
    expect(count(rules, /[{;]--clear:/g), 'one --clear for this frame, one for the upright frame').toBe(2);
    expect(own('.photo-hero__img--landmark').match(/var\(--clear\)/g)?.length, 'the photo').toBe(2);
    expect(own('.photo-hero--landmark:before'), 'the row above the words').toMatch(/height:calc\([^;]*var\(--clear\)/);
    expect(rules, 'a gap written in by hand').not.toMatch(/var\(--rise\) \+ \d+px/);

    const wider = within(/^\((?:min-width:\s?560px|width>=560px)\)$/);
    expect(own('.photo-hero--landmark', wider)).toMatch(/(?:^|;)--sky:32px(?:;|$)/);
    expect(own('.photo-hero--landmark:before', wider)).toMatch(
      /(?:^|;)--drawn:max\(720px,\s?100vw \/ var\(--shape\)\)(?:;|$)/,
    );

    // The photo's place reaches the styles as a property: an object-position
    // written on the element would win over the sideways frame below.
    expect(own('.photo-hero__img').split(';')).toContain('object-position:var(--place)');
    for (const route of ['/', '/ja']) {
      const img = html(route).match(/<img [^>]*photo-hero__img--landmark[^>]*>/)?.[0] ?? '';
      expect(img, route).toMatch(/ style="--place: \d+% [\d.]+%"/);
      expect(img, route).not.toMatch(/object-position/);
    }
    // The Experience band hands its crop over the same way.
    for (const route of ['/experience', '/ja/experience']) {
      const img = html(route).match(/<img [^>]*class="photo-hero__img[ "][^>]*>/)?.[0] ?? '';
      expect(img, route).toMatch(/ style="--place: 50% 40%"/);
      expect(img, route).not.toMatch(/object-position/);
    }

    const sideways = within(/^\(orientation:\s?landscape\) and \((?:max-height:\s?500px|height<=500px)\)$/);
    expect(own('.photo-hero--landmark', sideways).split(';')).toEqual(
      expect.arrayContaining(['--rise:32px', 'min-height:0']),
    );
    expect(own('.photo-hero--landmark:before', sideways)).toMatch(/(?:^|;)content:none(?:;|$)/);
    expect(own('.photo-hero__img--landmark', sideways).split(';')).toEqual(
      expect.arrayContaining([
        'inset:0 auto 0 0',
        'width:200%',
        'max-width:none',
        'height:100%',
        'object-position:0 50%',
        'transform:none',
        'mask-image:none',
      ]),
    );
    expect(own('.photo-hero--tall .photo-hero__text', sideways)).toMatch(/(?:^|;)padding-bottom:16px(?:;|$)/);
    // Last, as it overrides rules of the same weight: the text's padding,
    // the phone's frame, the landmark's own.
    const at = (rule: RegExp) => {
      const index = rules.search(rule);
      expect(index, String(rule)).toBeGreaterThan(-1);
      return index;
    };
    const turned = at(/@media \(orientation:\s?landscape\) and \((?:max-height:\s?500px|height<=500px)\)\{\.photo-hero/);
    for (const rule of [
      /\.photo-hero--landmark\[[^\]]+\]\{--rise:24px/,
      /\.photo-hero__img--landmark\[[^\]]+\]\{--need:/,
      /@media \((?:max-width:\s?559px|width<=559px)\)\{\.photo-hero/,
      /\.photo-hero--tall\[[^\]]+\] \.photo-hero__text\[[^\]]+\]\{padding-bottom:clamp\(/,
    ]) {
      expect(at(rule), String(rule)).toBeLessThan(turned);
    }
    // The phone and wide blocks come after the base rules they override, or
    // a laptop's sky row would fall back to the phone's.
    const base = Math.max(
      at(/\.photo-hero--landmark\[[^\]]+\]\{--rise:24px/),
      at(/\.photo-hero--landmark\[[^\]]+\]:before\{content:""/),
    );
    for (const block of [
      /@media \((?:min-width:\s?560px|width>=560px)\)\{\.photo-hero/,
      /@media \((?:max-width:\s?559px|width<=559px)\)\{\.photo-hero/,
    ]) {
      expect(at(block), String(block)).toBeGreaterThan(base);
    }

    const old = within(/^not \(height:\s?1svh\)$/);
    expect(own('.photo-hero--tall', old)).toMatch(/(?:^|;)min-height:340px(?:;|$)/);
    expect(own('.photo-hero--short', old)).toMatch(/(?:^|;)min-height:210px(?:;|$)/);
    expect(own('.photo-hero--landmark', old)).toMatch(/(?:^|;)--sky:\d+px(?:;|$)/);
  });

  // An upright phone (any upright screen under 560px) has a photo of its
  // own, taken upright as her picture is (01): the sign small and high on
  // the right, the palms on the left, where the landscape photo had to be
  // drawn two and a half screens wide to keep the words off its sign. The
  // photo is picked by a media query and framed by styles under the same
  // query, written the same way word for word, so a browser that cannot
  // read one cannot read the other (Safari before 16.4 reads no range
  // syntax, #97). Its files come first, in all three formats, so a browser
  // that takes the query never falls through to the landscape photo. It is
  // drawn the screen's width (more where the words run tall) and set by its
  // own landmark, mast and all: no centring, no fit, no fade, nothing
  // holding the photo's foot at the hero's, and a cut from the left only as
  // far as keeps the sign inside the gutter. Her picture's air under the
  // sign and her closer label, rule and button come with it.
  it("gives an upright phone its own photo, framed by that photo's sign", () => {
    const bare = (query: string) => query.replace(/\s+/g, '');
    let query = '';
    for (const route of ['/', '/ja']) {
      const hero = html(route).match(/<section class="photo-hero[^]*?<\/section>/)?.[0] ?? '';
      const tags = hero.match(/<(?:source|img) [^>]*>/g) ?? [];
      expect(tags.length, route).toBe(6);
      const [upright, main] = [tags.slice(0, 3), tags.slice(3)];
      expect(upright.map((tag) => tag.match(/ type="([^"]+)"/)?.[1]), route).toEqual([
        'image/avif',
        'image/webp',
        'image/jpeg',
      ]);
      for (const tag of upright) {
        const media = tag.match(/ media="([^"]+)"/)?.[1] ?? '';
        expect(media, route).toMatch(/\(orientation: ?portrait\)/);
        query ||= media;
        expect(media, route).toBe(query);
        expect(tag, route).toContain(' sizes="100vw"');
        expect(tag, route).toContain(' width="941" height="1672"');
        const urls = (tag.match(/ srcset="([^"]+)"/)?.[1] ?? '').split(',').map((part) => part.trim().split(' ')[0]);
        expect(urls.length, route).toBeGreaterThan(3);
        for (const url of urls) expect(url, route).toMatch(/^\/_astro\/hero-hollywood-upright\.[\w-]+\.(?:avif|webp|jpg)$/);
      }
      for (const tag of main) {
        expect(tag, route).not.toContain(' media=');
        expect(tag, route).not.toContain('hero-hollywood-upright');
      }
      expect(main[2], route).toMatch(/^<img /);
      const style = hero.match(/<section [^>]*style="([^"]*)"/)?.[1] ?? '';
      const value = (name: string) => style.match(new RegExp(`(?:^|; )--${name}: ([^;]+)`))?.[1] ?? '';
      // From the tip of the mast over the sign to its legs; across, the
      // letters' right edge, which the gutter keeps.
      expect(Number(value('upright-top')), route).toBeCloseTo(790 / 1672, 4);
      expect(Number(value('upright-foot')), route).toBeCloseTo(984 / 1672, 4);
      expect(Number(value('upright-right')), route).toBeCloseTo(746 / 941, 4);
      expect(Number(value('upright-shape')), route).toBeCloseTo(941 / 1672, 4);
    }

    // Every block written for an upright phone is under the photo's query,
    // word for word: the frame, and her words.
    const rules = css();
    const heads = [...rules.matchAll(/@media ([^{]*orientation:\s?portrait[^{]*)\{/g)].map((m) => m[1].trim());
    expect(heads.length, 'the frame and her words').toBe(2);
    for (const head of heads) expect(bare(head), head).toBe(bare(query));
    const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const upright = within(new RegExp(`^${literal(heads[0])}$`));
    const own = (selector: string) =>
      [...upright.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, s]) => s.trim().replace(/\[data-astro-cid-[^\]]+\]/g, '') === selector)
        .flatMap(([, , body]) => body.split(';'));
    // The frame comes after the phone's rules it overrides.
    expect(rules.search(/@media [^{]*orientation:\s?portrait[^{]*\{\.photo-hero--upright\[/)).toBeGreaterThan(
      rules.search(/@media \((?:max-width:\s?559px|width<=559px)\)\{\.photo-hero/),
    );
    // Her 40px or so of hillside between the legs and the label; the mast
    // is in the landmark, so a little sky over it will do.
    expect(own('.photo-hero--upright')).toEqual(expect.arrayContaining(['--clear:32px', '--sky:12px']));
    expect(own('.photo-hero--upright:before')).toEqual(
      expect.arrayContaining([
        '--top:var(--upright-top)',
        '--foot:var(--upright-foot)',
        '--drawn:calc(100vw / var(--upright-shape))',
      ]),
    );
    const photo = own('.photo-hero--upright .photo-hero__img--landmark');
    expect(photo).toEqual(
      expect.arrayContaining([
        '--foot:var(--upright-foot)',
        '--draw:max(var(--need), 100vw / var(--upright-shape))',
        // The box is the photo, at its own shape, never short of the screen.
        'width:auto',
        'min-width:100%',
        'max-width:none',
        'mask-image:none',
      ]),
    );
    const inset = photo.find((d) => d.startsWith('inset:')) ?? '';
    expect(inset).toMatch(/^inset:auto auto calc\(.*var\(--clear\).*var\(--draw\)\) 0$/);
    expect(inset, 'the foot held at the hero').not.toContain('max(');
    // Cut from the right, and from the left only as far as keeps the sign's
    // right edge inside the gutter: a translate, whose percentage is the
    // photo's own width (--draw's is the box's height, so it cannot say it).
    const turn = (photo.find((d) => d.startsWith('transform:')) ?? '').replace(/\s+/g, ' ');
    expect(turn).toMatch(
      /^transform:translate(?:X)?\(min\(0px, ?100vw - var\(--gutter\) - var\(--upright-right\) \* 100%\)\)$/,
    );
    expect(photo.join(';'), 'a place that leans on --draw').not.toMatch(/object-position:[^;]*--draw/);
    // Her label, rule and headline closer together, and her button nearer.
    expect(own('.hero__rule')).toContain('margin-block:7px');
    expect(own('.hero__cta').join(';')).toMatch(/(?:^|;)margin-top:clamp\(16px, ?2\.8vh, ?26px\)(?:;|$)/);
  });

  // Her 10A: the price card holds the prices and her note, and her request
  // button and 「まずは相談する」 sit under it, on the page. Her phone bar still
  // finds the button by its attribute.
  it('puts the request button and the second action under the price card', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(`${prefix}/experience/dodgers-transfer`);
      const pricing = doc.match(/<section class="pricing"[^>]*>[^]*?<\/section>/)?.[0] ?? '';
      const first = pricing.indexOf('<a ');
      expect(first, prefix).toBeGreaterThan(-1);
      const card = pricing.slice(0, first);
      expect(card, prefix).toContain('<div class="pricing__card panel"');
      expect(card, prefix).toContain('class="caption pricing__note"');
      // Every box the card opens is closed before the first link.
      expect(count(card, /<div[ >]/g), prefix).toBe(count(card, /<\/div>/g));
      const links = pricing.slice(first).match(/<a [^>]*>/g) ?? [];
      expect(links.length, prefix).toBe(2);
      expect(links[0], prefix).toMatch(/^<a class="btn btn--solid pricing__cta" href="[^"]+" data-plan-request/);
      expect(links[1], prefix).toMatch(/^<a class="pricing__ask" href="[^"]*\/consult\?service=dodgers-transfer"/);
    }
    // 「まずは相談する」 as wide as its words, so its focus ring hugs them,
    // and far enough under the button that the ring stands clear of it: at
    // 1px a gold ring against the olive read as touching.
    const ask = css().match(/\.pricing__ask\[data-astro-cid-[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(ask).toMatch(/(?:^|;)width:fit-content/);
    expect(ask).toMatch(/(?:^|;)margin-inline:auto/);
    const ring = css().match(/\}:focus-visible\{outline:(\d+)px solid [^;}]+;outline-offset:(\d+)px\}/);
    expect(ring, 'the focus ring').not.toBeNull();
    const clear = Number(ask.match(/(?:^|;)margin-top:(\d+)px/)?.[1]) - Number(ring?.[1]) - Number(ring?.[2]);
    expect(clear, 'between the ring and the button').toBeGreaterThanOrEqual(4);
  });

  // Her plain rows, her soft tiles, and her black ending (10A): the closing
  // panel, then the way back on the same black.
  it('ends her plan page on the black panel, after plain rows', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(`${prefix}/experience/dodgers-transfer`);
      expect(doc, prefix).toMatch(/<div class="details" data-astro-cid-/);
      expect(doc, prefix).toMatch(/<\/section><p class="back plate"/);
      expect(doc.indexOf('<p class="back plate"'), prefix).toBeGreaterThan(
        doc.indexOf('<section class="closing plate"'),
      );
    }
    const rules = css();
    expect(rules).toMatch(/\.tile\[data-astro-cid-[^\]]+\]\{[^}]*background:var\(--feature-tile\)/);
    expect(rules).toMatch(/\.back\[data-astro-cid-[^\]]+\]\{[^}]*background:var\(--bar\)/);
    const cid = html('/experience/dodgers-transfer').match(/<section class="closing plate"[^>]* data-astro-cid-(\w+)/)?.[1];
    expect(cid, "the plan page's scope").toBeTruthy();
    const scoped = (name: string) => String.raw`\.${name}\[data-astro-cid-${cid}\]`;
    // On a phone the black follows the last row straight on, with one line
    // between them at most: the last row draws none, the panel's edge ends
    // the list. That edge is transparent in the cream theme, unseen on the
    // black, but a contrast theme draws it; in the dark theme, where the
    // panel's black is the page's own, a gold line marks where it starts.
    // The panel and the way back keep the page's gutters. From 681px the
    // card stands apart, the last row keeps its line, and the page's padding
    // keeps the card off the footer.
    const ending = [
      new RegExp(String.raw`${scoped('detail')}:last-child\{border-bottom:0\}`),
      new RegExp(String.raw`${scoped('closing')}\{(?:[^}]*;)?padding:24px var\(--gutter\) 22px(?:;|\})`),
      new RegExp(String.raw`${scoped('back')}\{(?:[^}]*;)?padding:4px var\(--gutter\) 12px(?:;|\})`),
    ];
    expect(rules).toMatch(/\.closing\[data-astro-cid-[^\]]+\]\{(?:[^}]*;)?border-top:1px solid (?:#0000|transparent)(?:;|\})/);
    expect(rules).toMatch(
      new RegExp(String.raw`html\[data-theme=dark\] ${scoped('closing')}\{border-top-color:var\(--hairline\)\}`),
    );
    const wide = within(/^\((?:min-width:\s?681px|width>=681px)\)$/);
    expect(wide).toMatch(
      /\.detail\[data-astro-cid-[^\]]+\]:last-child\{border-bottom:1px solid var\(--hairline-soft\)\}/,
    );
    expect(wide).toMatch(/\.closing\[data-astro-cid-[^\]]+\]\{[^}]*border-radius:/);
    expect(wide).toMatch(
      new RegExp(String.raw`${scoped('plan-page')}\{(?:[^}]*;)?padding-bottom:clamp\(36px,\s?6vw,\s?56px\)(?:;|\})`),
    );
    // The phone's ending is the default and the wide card overrides it, so
    // no width falls between a max-width: 680px and a min-width: 681px,
    // as one at 680.8px under browser zoom did. Defaults, in no block, and
    // before the card that overrides them with the same weight.
    const phone = within(/^\((?:max-width:\s?680px|width<=680px)\)$/);
    expect(phone).not.toMatch(/\.(?:plan-page|detail|closing|back)\[/);
    const card = rules.search(
      new RegExp(String.raw`@media \((?:min-width:\s?681px|width>=681px)\)\{[^@]*${scoped('closing')}`),
    );
    expect(card, 'the wide card').toBeGreaterThan(-1);
    const blocks = within(/./);
    for (const rule of ending) {
      expect(rules.search(rule), String(rule)).toBeGreaterThan(-1);
      expect(rules.search(rule), String(rule)).toBeLessThan(card);
      expect(blocks.search(rule), `${rule} inside a block`).toBe(-1);
    }
  });
});

// The photos made for each spot (#101), in place of the stand-ins found
// online, each with words that say what it shows. The Japanese ones are
// drafts for Amelia's read.
describe('the photographs made for each spot', () => {
  const SPOTS = [
    {
      page: '',
      file: 'hero-hollywood',
      // What both of its photos show: only the landscape one has downtown.
      en: 'The Hollywood Sign lit by the setting sun',
      ja: '夕日に照らされたハリウッドサイン',
    },
    {
      page: '/experience/dodgers-transfer',
      file: 'stadium-twilight',
      en: 'A full ballpark at twilight, its field lit, palm trees beyond the outfield',
      ja: '夕暮れの野球場。満員のスタンドと、ライトに照らされたグラウンド',
    },
    {
      page: '/experience',
      file: 'beach-palms-dusk',
      en: 'Palm trees along a beach at dusk, under a lavender and peach sky',
      ja: '夕暮れの海辺に並ぶヤシの木',
    },
    {
      page: '/about',
      file: 'griffith-observatory-golden',
      en: 'Griffith Observatory above Los Angeles at golden hour, downtown in the distance',
      ja: '夕日のグリフィス天文台。遠くにダウンタウンの街並み',
    },
    {
      page: '/about',
      file: 'malibu-cliff-house',
      en: 'A house on the cliffs above the Malibu coast at sunset',
      ja: '夕日のマリブ海岸。崖の上に建つ邸宅',
    },
  ];
  const img = (route: string, file: string) =>
    (html(route).match(/<img [^>]*>/g) ?? []).find((tag) => tag.includes(`/_astro/${file}.`)) ?? '';

  it('shows each photo in its spot, with its words, in both languages', () => {
    for (const spot of SPOTS) {
      for (const [prefix, alt] of [
        ['', spot.en],
        ['/ja', spot.ja],
      ] as const) {
        const route = prefix + spot.page || '/';
        expect(img(route, spot.file), `${route}: ${spot.file}`).toContain(`alt="${alt}"`);
      }
    }
    // The ballpark is the plan's photo wherever the plan is shown: beside its
    // name on the booking form, where words would only repeat the name.
    for (const route of ['/book/dodgers-transfer', '/ja/book/dodgers-transfer']) {
      // Astro writes an empty alt as the bare attribute.
      expect(img(route, 'stadium-twilight'), route).toMatch(/ alt(?:="")? /);
    }
  });

  // The link preview is built from the homepage's photo by scripts/og.mjs,
  // and the committed image is the one the script makes now: a new photo,
  // logo or layout without a rerun fails here. Compared as decoded pixels,
  // since another machine's encoder may write other bytes for the same
  // picture: within a level per channel on average, and no more than one
  // pixel in a thousand off by more than 16 in any channel. The logo draws
  // under a hundredth of the frame, too little to move the average: a
  // preview without it, or with it faded, fails on the pixel count.
  it('builds the link preview from the homepage photo, as the script makes it now', async () => {
    const root = process.cwd();
    const script = readFileSync(join(root, 'scripts/og.mjs'), 'utf8');
    const photo = readFileSync(join(root, 'src/views/Landing.astro'), 'utf8').match(
      /import heroImg from '\.\.\/assets\/([^']+)'/,
    )?.[1];
    expect(photo, "the homepage's photo").toBeTruthy();
    expect(script).toContain(`sharp('src/assets/${photo}')`);
    const dir = mkdtempSync(join(tmpdir(), 'llt-og-'));
    try {
      const fresh = join(dir, 'default.jpg');
      execFileSync(process.execPath, ['scripts/og.mjs', fresh], { cwd: root, stdio: 'pipe' });
      const pixels = (file: string) => sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const [kept, made] = await Promise.all([pixels(join(root, 'public/og/default.jpg')), pixels(fresh)]);
      expect([kept.info.width, kept.info.height, kept.info.channels]).toEqual([1200, 630, 3]);
      expect([made.info.width, made.info.height, made.info.channels]).toEqual([1200, 630, 3]);
      let sum = 0;
      let off = 0;
      for (let i = 0; i < kept.data.length; i += 3) {
        let most = 0;
        for (let c = i; c < i + 3; c++) {
          const d = Math.abs(kept.data[c] - made.data[c]);
          sum += d;
          most = Math.max(most, d);
        }
        if (most > 16) off++;
      }
      const mean = sum / kept.data.length;
      const share = off / (kept.data.length / 3);
      console.info(
        `link preview against a fresh render: mean difference ${mean.toFixed(3)} per channel, ` +
          `${off} pixels (${(share * 100).toFixed(3)}%) off by more than 16`,
      );
      expect(mean, `mean difference per channel ${mean.toFixed(2)} of 255`).toBeLessThanOrEqual(1);
      expect(share, `${off} pixels off by more than 16`).toBeLessThanOrEqual(0.001);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  // Its words say what it shows: the sign, and no longer the palm road of
  // the stand-in it replaced. One preview for every page, so every page in
  // each language.
  it('describes the link preview as the Hollywood photo, in both languages', () => {
    const alt = (doc: string) => doc.match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1] ?? '';
    expect(alt(html('/'))).toBe(
      'The Hollywood Sign at sunset above Los Angeles, with the Los Angeles Luxury Tour logo',
    );
    expect(alt(html('/ja'))).toBe('夕日に照らされたハリウッドサインと、Los Angeles Luxury Tourのロゴ');
    for (const file of allPages()) {
      const doc = readFileSync(file, 'utf8');
      const ja = /<html lang="ja"/.test(doc);
      expect(alt(doc), file).toMatch(ja ? /ハリウッドサイン/ : /Hollywood Sign/);
      expect(alt(doc), file).not.toMatch(/palm|downtown|パームツリー|並木道|ダウンタウン/i);
    }
  });

  // The stand-ins found online, with no record of where they came from, and
  // two files nothing used: gone, and nothing anywhere points at them. Every
  // file in the project, the root's config and .github's included, read from
  // the disk, so the check needs no git and runs as well in a source export;
  // and every file the build wrote. Left out: this file, which has to name
  // them, and what is not the project's own at the root: the dependencies,
  // git, Astro's and Wrangler's local state and the working notes. A file
  // with a NUL byte in it is an image or a font, with no words to check.
  it('leaves no trace of the photos it took out', () => {
    const gone =
      /hero-dtla|hero-dusk|hero-malibu|divider-architecture|\bsteak\.(?:[\w-]+\.)?(?:jpe?g|webp|avif|png)\b|assets\/steak\b/;
    const root = process.cwd();
    const walk = (dir: string, skip: string[] = []): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (skip.includes(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() ? [path] : [];
      });
    // dist is read on its own, below.
    const own = walk(root, ['node_modules', '.git', '.astro', '.wrangler', '.arya', 'dist']).filter(
      (path) => path !== join(root, 'tests', 'build.test.ts'),
    );
    expect(own.length).toBeGreaterThan(100);
    expect(own).toContain(join(root, 'astro.config.mjs'));
    expect(own).toContain(join(root, '.github', 'workflows', 'ci.yml'));
    for (const file of [...own, ...walk(DIST)]) {
      const name = file.slice(root.length);
      expect(name, 'a file by that name').not.toMatch(gone);
      const bytes = readFileSync(file);
      // The match, not the file: some of these are large, or private.
      if (!bytes.includes(0)) expect(new TextDecoder().decode(bytes).match(gone)?.[0], name).toBeUndefined();
    }
  });
});
