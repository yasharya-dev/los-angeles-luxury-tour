import { describe, expect, it } from 'vitest';
import {
  alternatePath,
  localeFromPath,
  localizePath,
  pagePath,
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

// The build writes about.html, and while it does Astro reports that file's
// path as the page's. In dev it reports the clean one. Both have to come out
// as the public path, or every URL built from "this page" is wrong in
// production only.
describe('pagePath', () => {
  it('drops the .html the build adds', () => {
    expect(pagePath('/about.html')).toBe('/about');
    expect(pagePath('/ja/about.html')).toBe('/ja/about');
    expect(pagePath('/ja/experience/temecula.html')).toBe('/ja/experience/temecula');
  });

  it('turns the two home files into their paths', () => {
    expect(pagePath('/index.html')).toBe('/');
    expect(pagePath('/ja.html')).toBe('/ja');
    expect(pagePath('/ja/index.html')).toBe('/ja');
  });

  it('leaves a clean path alone, as astro dev reports it', () => {
    expect(pagePath('/')).toBe('/');
    expect(pagePath('/ja')).toBe('/ja');
    expect(pagePath('/about')).toBe('/about');
    expect(pagePath('/ja/about/')).toBe('/ja/about');
  });

  // The language link is where this used to bite: /ja.html read as an English
  // page called "ja.html", so its English counterpart was itself.
  it('lets the Japanese home find the English one', () => {
    expect(alternatePath(pagePath('/ja.html'), 'en')).toBe('/');
    expect(alternatePath(pagePath('/index.html'), 'ja')).toBe('/ja');
    expect(alternatePath(pagePath('/ja/book.html'), 'en')).toBe('/book');
  });

  it('only strips a trailing .html, not one inside a segment', () => {
    expect(pagePath('/notes.html.bak')).toBe('/notes.html.bak');
    expect(pagePath('/html')).toBe('/html');
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

  it('has no empty strings', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(ui[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
