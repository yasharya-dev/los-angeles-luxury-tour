import { describe, expect, it } from 'vitest';
import { isJapanese, phrases } from '../src/i18n/phrase';
import { BR, plain } from '../src/i18n/text';
import { offerings } from '../src/data/offerings';
import { plans } from '../src/data/plans';

// Every Japanese string the cards and plan pages actually render.
const corpus = [
  ...offerings.flatMap((o) => [o.name.ja, o.blurb.ja]),
  ...plans.flatMap((p) => [
    p.title.ja,
    p.subtitle.ja,
    ...p.intro.ja,
    ...p.sections.flatMap((s) => [...(s.bullets?.ja ?? []), ...(s.paragraphs?.ja ?? [])]),
  ]),
  '現地在住の日本人ガイドが、移動から観光まで、お客様だけの旅をサポートします。',
  '旅のスタイルに合わせたプランをご用意しています。',
  'ショッピング代行・レストラン予約・飲食店での同行サポートも承ります（個別お見積り）。',
];

// Katakana letters and the long-vowel bar. Not the middle dot (U+30FB), which
// sits in the same block but is a list mark, and a fair place to fold.
const KATAKANA = /[ァ-ヺー-ヿ]/;
const NO_START = /^[、。，．・：；？！）」』】ー〜ぁぃぅぇぉっゃゅょァィゥェォッャュョ]/;
const MARKS = /[、。，．・：；？！（）「」『』【】／〜…⇔]/g;

describe('phrases', () => {
  it('gives the text back exactly when joined', () => {
    for (const text of corpus) expect(phrases(text).join(''), text).toBe(text);
  });

  it('leaves English whole', () => {
    expect(isJapanese('Plans to suit the way you like to travel.')).toBe(false);
    expect(phrases('Plans to suit the way you like to travel.')).toEqual([
      'Plans to suit the way you like to travel.',
    ]);
  });

  // The defect this exists for: ディ/ナー, 送迎付きツ/アー, ドライ/バー.
  it('never folds inside a katakana word', () => {
    for (const text of corpus) {
      const parts = phrases(text);
      for (let i = 0; i < parts.length - 1; i++) {
        const [a, b] = [parts[i].slice(-1), parts[i + 1][0]];
        expect(KATAKANA.test(a) && KATAKANA.test(b), `${text}: ${parts[i]} | ${parts[i + 1]}`).toBe(false);
      }
    }
  });

  // BudouX on its own proposes 空|港送迎. A fold has to be a word start too.
  it('does not cut inside a word the dictionary knows', () => {
    expect(phrases('空港送迎（LAX⇔ホテル往復）')[0]).toBe('空港送迎');
    expect(phrases('買い物立ち寄り可').join('|')).not.toContain('買い|物');
  });

  // Kinsoku: no line may start with a closing mark, a small kana or the
  // long-vowel bar.
  it('never lets a phrase start with a mark that cannot start a line', () => {
    for (const text of corpus) {
      for (const part of phrases(text).slice(1)) {
        expect(NO_START.test(part), `${text}: "${part}"`).toBe(false);
      }
    }
  });

  // A one-character phrase is the stranded character this is here to prevent.
  it('never produces a phrase of a single character', () => {
    for (const text of corpus) {
      const parts = phrases(text);
      if (parts.length === 1) continue;
      for (const part of parts) {
        expect(part.replace(MARKS, '').trim().length, `${text}: "${part}"`).toBeGreaterThan(1);
      }
    }
  });

  it('lets a line written as a list fold item by item', () => {
    expect(phrases('8時間完全貸切・チケット手配込み・空港またはホテルお迎え').slice(0, 2)).toEqual([
      '8時間完全貸切・',
      'チケット手配込み・',
    ]);
  });

  // A long compound noun has no phrase boundary of its own, and would fold
  // wherever the column ran out.
  it('opens a long compound at its word seams', () => {
    expect(phrases('ドジャース観戦チケット購入代行').length).toBeGreaterThan(1);
    expect(phrases('ひとり旅プライベートプラン')).toEqual(['ひとり旅', 'プライベートプラン']);
  });

  it('keeps a number with its counter and a time range whole', () => {
    const parts = phrases('9:00〜18:00・ホテル発着・受賞ワイナリー3か所');
    expect(parts[0]).toBe('9:00〜18:00・');
    expect(parts.at(-1)).toBe('受賞ワイナリー3か所');
  });
});

describe('authored copy', () => {
  it('reads as one plain string for a title or a label', () => {
    expect(plain(['ロサンゼルスで叶える、', BR, 'あなただけの特別な旅。'])).toBe(
      'ロサンゼルスで叶える、あなただけの特別な旅。',
    );
    expect(plain('A plain string')).toBe('A plain string');
  });
});
