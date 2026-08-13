import { describe, expect, it } from 'vitest';
import { offerings, tierOrder, byTier, bySlug } from '../src/data/offerings';
import { journeys, journeyBySlug } from '../src/data/journeys';
import { CONTACT } from '../src/data/contact';
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
  // read as the wrong currency entirely.
  it('leads in the right currency for each locale', () => {
    for (const o of offerings) {
      expect(o.price.en, `${o.id} en`).toMatch(/\$/);
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
      if (/per group/i.test(en)) {
        expect(ja, `${o.id} says per group in en`).toMatch(/グループ/);
      }
      if (/per person/i.test(en)) {
        expect(ja, `${o.id} says per person in en`).toMatch(/名様/);
        expect(ja, `${o.id} is per person, not per group`).not.toMatch(/グループ/);
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

  it('looks up by slug', () => {
    expect(bySlug('temecula')?.id).toBe('temecula');
    expect(bySlug('nope')).toBeUndefined();
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
