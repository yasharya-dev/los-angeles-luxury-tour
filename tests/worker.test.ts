import { describe, expect, it } from 'vitest';
import { clean, escapeHtml, thanksPath } from '../worker/index';

describe('clean', () => {
  it('trims and returns strings', () => {
    expect(clean('  hi  ')).toBe('hi');
  });

  it('rejects non-strings', () => {
    expect(clean(null)).toBe('');
  });

  it('caps length', () => {
    expect(clean('a'.repeat(5000)).length).toBe(2000);
    expect(clean('abcdef', 3)).toBe('abc');
  });

  // Control characters in a header-adjacent field are how header injection
  // starts, so they are stripped. Newlines are legitimate in the free-text
  // field and survive.
  it('strips control characters but keeps newlines and tabs', () => {
    expect(clean('a' + String.fromCharCode(0) + 'bc')).toBe('abc');
    expect(clean('a\nb\tc')).toBe('a\nb\tc');
    expect(clean('a' + String.fromCharCode(0x7f) + 'b')).toBe('ab');
  });
});

describe('escapeHtml', () => {
  it('escapes the four dangerous characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes the ampersand first, so entities are not double-broken', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves Japanese untouched', () => {
    expect(escapeHtml('完全予約制')).toBe('完全予約制');
  });
});

describe('thanksPath', () => {
  it('mirrors the site routes', () => {
    expect(thanksPath('ja')).toBe('/ja/thank-you');
    expect(thanksPath('en')).toBe('/thank-you');
  });

  it('falls back to English for anything unexpected', () => {
    expect(thanksPath('fr')).toBe('/thank-you');
    expect(thanksPath('')).toBe('/thank-you');
  });
});
