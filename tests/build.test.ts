// Runs against dist/, so `npm run build` has to have happened first.
// `npm test` chains them.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

// Form destinations, not pages anyone should land on from search.
const NOT_IN_SITEMAP = [
  '/thank-you',
  '/book/received',
  // A step on the way to the form, not a page anyone lands on from search.
  ...offerings.map((o) => `/book/${o.id}`),
];

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
    // Spaces, and the invisible fold (U+200B) that is not one to a regex.
    .replace(/[\s​]+/g, '');

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
        return inner.trim().replace(/​/g, '/');
      },
    );
    expect(titles).toEqual(['日本語で安心', '高級車で/完全貸切', 'オーダーメイドの/旅']);
  });

  // A plan with its own page links to it. The rest open in place and hold
  // what the visitor came for: the description and both ways to act on it.
  it('lists every plan as a card with its price and a way to its details', () => {
    const text = (markup: string) => markup.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
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
  // over the content. Her brief: nothing may cover the page.
  // Nothing is pinned over a page. (Her plan page's optional booking bar was
  // left out: on a page that short one of its two request buttons is always
  // on screen, and a bar would only cover what is under it.)
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
    // The hero is 52% of the screen tall and the photo is 1920 by 1255, so
    // on an upright phone it is drawn 80% of a screen-height wide. The
    // Experience band is cut to 3:2 and is 32% tall: 48%.
    const sizes = (route: string) => picture(route).match(/sizes="([^"]+)"/)?.[1] ?? '';
    expect(sizes('/')).toBe('(max-aspect-ratio: 80/100) 80vh, 100vw');
    expect(sizes('/experience')).toBe('(max-aspect-ratio: 48/100) 48vh, 100vw');
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
// that quietly moved on the site.
describe('Japanese line folds', () => {
  it('folds every line where it did when this was last reviewed', async () => {
    const lines = new Set<string>();
    for (const p of PATHS) {
      for (const [, inner] of html(`/ja${p === '/' ? '' : p}`).matchAll(
        /<span class="phrases"[^>]*>([^]*?)<\/span>/g,
      )) {
        lines.add(
          inner
            .replace(/<wbr[^>]*>/g, ' | ')
            // A label's folds are U+200B (see Phrases.astro): folds all the same.
            .replace(/​/g, ' | ')
            .replace(/<br[^>]*>/g, ' // ')
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
      .replace(/[\s​]+/g, '');

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
  // the consultation link once, as her closing panel has none.
  it('puts both actions by the price, and the request again at the end', () => {
    for (const prefix of ['', '/ja']) {
      const doc = html(prefix + page);
      expect(count(doc, new RegExp(`href="${prefix}/book/dodgers-transfer"`, 'g'))).toBe(2);
      expect(count(doc, new RegExp(`href="${prefix}/consult[?]service=dodgers-transfer"`, 'g'))).toBe(1);
      const closing = doc.match(/<section class="closing plate"[^]*?<\/section>/)?.[0] ?? '';
      expect(closing).toMatch(new RegExp(`<a class="btn btn--solid[^"]*" href="${prefix}/book/dodgers-transfer"`));
    }
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
      .replace(/[\s​]+/g, '');

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

  // Edge and Chrome otherwise read an untouched required date, select or
  // radio out as invalid. The script sets it to true only once it is.
  it('reads no field out as invalid before the guest has touched it', () => {
    for (const p of ['/ja/book/dodgers-transfer', '/book/temecula', '/ja/consult', '/consult']) {
      const tags = html(p).match(/<(input|select|textarea)\b[^>]*\brequired\b[^>]*>/g) ?? [];
      expect(tags.length, p).toBeGreaterThan(2);
      for (const tag of tags) expect(tag, p).toContain('aria-invalid="false"');
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
    const seenLine = (markup: string) => markup.replace(/<(?!\/?a[\s>])[^>]+>/g, '');
    for (const p of ['/ja/book', '/ja/consult', '/ja/book/temecula']) {
      expect(seenLine(html(p)), p).not.toMatch(/[、：]\s+<a /);
    }
    const sendLine = (p: string) =>
      seenLine(html(p).match(/<p class="form__err" data-send-error[^]*?<\/p>/)?.[0] ?? '');
    for (const p of ['/ja/consult', '/ja/book/temecula']) {
      expect(sendLine(p), p).toContain('ご連絡ください：​<a href="mailto:');
    }
    for (const p of ['/consult', '/book/temecula']) {
      expect(sendLine(p), p).toContain('directly at ​<a href="mailto:');
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
    expect(pickup.replace(/​/g, '')).toBe('送迎場所やご希望など、お気軽にお知らせください。');
    expect(pickup.split('​').length).toBeGreaterThan(2);
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
    for (const p of ['/ja/book', '/ja/book/dodgers-transfer', '/ja/book/received']) {
      expect(html(p), p).not.toContain('※ご予約は送信後');
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
