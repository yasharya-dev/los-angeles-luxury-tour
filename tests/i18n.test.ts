import { describe, expect, it } from 'vitest';
import {
  alternatePath,
  localeFromPath,
  localizePath,
} from '../src/i18n/utils';
import { locales, ui } from '../src/i18n/ui';

describe('localizePath', () => {
  it('leaves English unprefixed', () => {
    expect(localizePath('/about', 'en')).toBe('/about');
    expect(localizePath('/', 'en')).toBe('/');
  });

  it('prefixes other locales', () => {
    expect(localizePath('/about', 'ja')).toBe('/ja/about');
  });

  // /ja/ not //ja, and /ja not /ja/
  it('handles the root without doubling slashes', () => {
    expect(localizePath('/', 'ja')).toBe('/ja');
  });

  it('tolerates a missing leading slash', () => {
    expect(localizePath('about', 'ja')).toBe('/ja/about');
  });
});

describe('localeFromPath', () => {
  it('reads the prefix', () => {
    expect(localeFromPath('/ja/about')).toBe('ja');
    expect(localeFromPath('/ja')).toBe('ja');
  });

  it('falls back to English', () => {
    expect(localeFromPath('/about')).toBe('en');
    expect(localeFromPath('/')).toBe('en');
  });

  // "japan" starts with "ja" but isn't a locale
  it('does not match a prefix that merely starts the same', () => {
    expect(localeFromPath('/japan-guide')).toBe('en');
  });
});

describe('alternatePath', () => {
  it('crosses in both directions', () => {
    expect(alternatePath('/about', 'ja')).toBe('/ja/about');
    expect(alternatePath('/ja/about', 'en')).toBe('/about');
  });

  it('handles the homepage', () => {
    expect(alternatePath('/', 'ja')).toBe('/ja');
    expect(alternatePath('/ja', 'en')).toBe('/');
  });

  it('keeps nested routes intact', () => {
    expect(alternatePath('/experience/temecula', 'ja')).toBe(
      '/ja/experience/temecula',
    );
    expect(alternatePath('/ja/experience/temecula', 'en')).toBe(
      '/experience/temecula',
    );
  });

  // Round-tripping must land back where it started, or the toggle drifts.
  it('round-trips', () => {
    for (const path of ['/', '/about', '/experience/temecula', '/contact']) {
      expect(alternatePath(alternatePath(path, 'ja'), 'en')).toBe(path);
    }
  });
});

describe('ui dictionaries', () => {
  it('every locale defines every key', () => {
    const keys = Object.keys(ui.en).sort();
    for (const locale of locales) {
      expect(Object.keys(ui[locale]).sort(), `locale ${locale}`).toEqual(keys);
    }
  });

  // price.note is intentionally empty on EN (no yen conversion shown there),
  // so it is the one permitted blank.
  it('has no accidentally empty strings', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(ui[locale])) {
        if (key === 'price.from' || key === 'price.note') continue;
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
