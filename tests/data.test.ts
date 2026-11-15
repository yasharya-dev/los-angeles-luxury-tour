import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  offerings,
  tierOrder,
  byTier,
  bySlug,
  bookPath,
  consultPath,
} from '../src/data/offerings';
import { journeys, journeyBySlug } from '../src/data/journeys';
import { CONTACT } from '../src/data/contact';
import { plans, lowestPrice } from '../src/data/plans';
import { locales } from '../src/i18n/ui';

describe('offerings', () => {
  it('has unique ids and slugs', () => {
    const ids = offerings.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);

    const slugs = offerings.filter((o) => o.slug).map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('is fully bilingual', () => {
    for (const o of offerings) {
      for (const locale of locales) {
        expect(o.name[locale], `${o.id} name`).toBeTruthy();
        expect(o.blurb[locale], `${o.id} blurb`).toBeTruthy();
        expect(o.price[locale], `${o.id} price`).toBeTruthy();
      }
    }
  });

  // A card either links to the plan's page or opens in place. One that opens
  // needs something to show.
  it('gives every plan its own page or a description for its card', () => {
    for (const o of offerings) {
      if (o.slug) continue;
      for (const locale of locales) {
        expect(o.detail?.[locale].body.trim(), `${o.id} ${locale}`).toBeTruthy();
      }
    }
  });

  // Prices are floors, never fixed fares. Her own material contradicts itself
  // on this, so the site commits to the from-form everywhere.
  it('quotes every price as a floor', () => {
    for (const o of offerings) {
      expect(o.price.en, `${o.id} en`).toMatch(/from|an hour/i);
      expect(o.price.ja, `${o.id} ja`).toContain('〜');
    }
  });

  // Yen sits in priceNote, not price, so check the pair as it renders.
  it('shows yen only on the Japanese side', () => {
    for (const o of offerings) {
      const en = o.price.en + (o.priceNote?.en ?? '');
      const ja = o.price.ja + (o.priceNote?.ja ?? '');
      expect(en, `${o.id} en`).not.toMatch(/円/);
      expect(ja, `${o.id} ja`).toMatch(/円/);
    }
  });

  // Japanese pages lead in yen, English in USD. Getting this backwards would
  // read as the wrong currency entirely. A plan she has priced only in yen so
  // far (her sample plan) may lead in yen on the English side, with the ¥ sign
  // and never 円, until she gives the dollar figure.
  it('leads in the right currency for each locale', () => {
    for (const o of offerings) {
      expect(o.price.en, `${o.id} en`).toMatch(/\$|¥/);
      expect(o.price.ja, `${o.id} ja`).toMatch(/円/);
      expect(o.price.ja, `${o.id} ja must not lead in USD`).not.toMatch(/^\$/);
    }
  });

  // A per-group price shown as per-person, or the reverse, is a real
  // commercial error rather than a copy nit.
  it('never mixes per-group and per-person units across locales', () => {
    for (const o of offerings) {
      const en = o.priceNote?.en ?? '';
      const ja = o.priceNote?.ja ?? '';
      // A group is グループ in the older plans and 組 in hers.
      if (/per group/i.test(en)) {
        expect(ja, `${o.id} says per group in en`).toMatch(/グループ|組/);
      }
      if (/per person/i.test(en)) {
        expect(ja, `${o.id} says per person in en`).toMatch(/名様/);
        expect(ja, `${o.id} is per person, not per group`).not.toMatch(/グループ|組/);
      }
    }
  });

  // 約 means "about". It belongs on figures we converted, never on the prices
  // she publishes in yen herself.
  it('marks converted yen with 約 and native yen without it', () => {
    for (const o of offerings) {
      const nativeYen = !/約/.test(o.price.ja);
      const enHasUsdSource = /\$[\d,]+/.test(o.price.en);
      if (nativeYen) {
        expect(o.priceNote?.ja ?? '', `${o.id}`).not.toMatch(/\$/);
      } else {
        expect(enHasUsdSource, `${o.id} converted yen needs a USD source`).toBe(true);
      }
    }
  });

  it('assigns every offering to a known tier', () => {
    for (const o of offerings) expect(tierOrder).toContain(o.tier);
  });

  it('leaves no tier empty', () => {
    for (const tier of tierOrder) expect(byTier(tier).length).toBeGreaterThan(0);
  });

  // Every plan books and consults on the site, with the plan carried through
  // so the form opens on it. Nothing renders with nothing to click.
  it('books and consults on the site, with the plan carried through', () => {
    for (const o of offerings) {
      expect(bookPath(o)).toBe(`/book?service=${o.id}`);
      expect(consultPath(o)).toBe(`/consult?service=${o.id}`);
    }
  });

  // Every plan books on the site now. Her JotForms stay live on her Linktree
  // and in her Instagram CTAs; the website simply does not point at them.
  it('points at no JotForm', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/data/offerings.ts'),
      'utf8',
    );
    expect(src.toLowerCase()).not.toContain('jotform');
    for (const o of offerings) {
      expect(o, o.id).not.toHaveProperty('formUrl');
    }
  });

  it('carries no leftover TODO markers', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/data/offerings.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/TODO/);
  });

  it('looks up by slug', () => {
    expect(bySlug('temecula')?.id).toBe('temecula');
    expect(bySlug('nope')).toBeUndefined();
  });
});

// Plans in her format. Each one is a detail page plus a card; the two have
// to agree, and both languages have to carry the same structure.
describe('plans', () => {
  it('each has a card with the same slug and id', () => {
    for (const plan of plans) {
      const o = bySlug(plan.slug);
      expect(o, plan.slug).toBeDefined();
      expect(o?.id).toBe(plan.slug);
    }
  });

  it('puts the lowest price on the card, in each language', () => {
    for (const plan of plans) {
      const o = bySlug(plan.slug)!;
      expect(o.price.ja, plan.slug).toBe(lowestPrice(plan, 'ja'));
      expect(o.price.en, plan.slug).toBe(lowestPrice(plan, 'en'));
    }
  });

  // Her plan page has the same parts for every plan, in both languages: a
  // plan missing one would render a hole in her layout.
  it('fills every part of her plan page, in both languages', () => {
    for (const plan of plans) {
      const id = plan.slug;
      for (const locale of locales) {
        for (const [part, value] of Object.entries({
          title: plan.title[locale],
          description: plan.description[locale],
          intro: plan.intro[locale],
          unit: plan.unit[locale],
          priceNote: plan.priceNote[locale],
          experienceTitle: plan.experience.title[locale],
          experienceBody: plan.experience.body[locale],
          closing: plan.closing[locale],
        })) {
          expect(value.length, `${id} ${part} ${locale}`).toBeGreaterThan(0);
        }
        for (const row of [...plan.prices, ...plan.tiles]) {
          expect(row.label[locale], `${id} label ${locale}`).toBeTruthy();
        }
        for (const row of plan.usage) {
          expect(row.label[locale] && row.value[locale], `${id} usage ${locale}`).toBeTruthy();
        }
        for (const d of plan.details) expect(d.label[locale], `${id} details ${locale}`).toBeTruthy();
      }
      // Her design: three equal tiles, at least one price, a fixed amount.
      expect(plan.tiles.length, id).toBe(3);
      expect(plan.prices.length, id).toBeGreaterThan(0);
      for (const row of plan.prices) expect(row.yen, id).toBeGreaterThan(0);
      expect(plan.services.en.length, id).toBe(plan.services.ja.length);
      for (const d of plan.details) {
        for (const b of d.blocks) {
          if (b.bullets) expect(b.bullets.en.length, id).toBe(b.bullets.ja.length);
          if (b.paragraphs) expect(b.paragraphs.en.length, id).toBe(b.paragraphs.ja.length);
        }
      }
      // Her cancellation terms have to be on the page before the form.
      expect(plan.details.some((d) => d.cancellation), `${id} cancellation`).toBe(true);
    }
  });
});

describe('journeys', () => {
  it('every journey maps to a real offering with a slug', () => {
    for (const j of journeys) {
      const o = bySlug(j.slug);
      expect(o, `journey ${j.slug} has no offering`).toBeDefined();
      expect(o?.slug).toBe(j.slug);
    }
  });

  it('is fully bilingual', () => {
    for (const j of journeys) {
      for (const locale of locales) {
        expect(j.title[locale].length, `${j.slug} title`).toBeGreaterThan(0);
        expect(j.lead[locale], `${j.slug} lead`).toBeTruthy();
        expect(j.includes[locale].length, `${j.slug} includes`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps both locales of a list the same length', () => {
    for (const j of journeys) {
      expect(j.includes.en.length, `${j.slug} includes`).toBe(
        j.includes.ja.length,
      );
      expect(j.excludes.en.length, `${j.slug} excludes`).toBe(
        j.excludes.ja.length,
      );
      if (j.schedule) {
        for (const row of j.schedule) {
          expect(row.title.en, `${j.slug} ${row.time}`).toBeTruthy();
          expect(row.title.ja, `${j.slug} ${row.time}`).toBeTruthy();
        }
      }
    }
  });

  it('looks up by slug', () => {
    expect(journeyBySlug('temecula')?.slug).toBe('temecula');
    expect(journeyBySlug('nope')).toBeUndefined();
  });
});

describe('contact', () => {
  // The only phone number she ever published is a Hawaii number from a previous
  // operation. It must never reach the site.
  it('publishes no phone number', () => {
    const blob = JSON.stringify(CONTACT);
    expect(blob).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    expect(blob).not.toContain('808');
  });

  it('keeps the LINE id lowercase', () => {
    expect(CONTACT.lineId).toBe(CONTACT.lineId.toLowerCase());
  });

  it('points the LINE url at the same id', () => {
    expect(CONTACT.lineUrl).toContain(CONTACT.lineId.replace('@', ''));
  });
});
