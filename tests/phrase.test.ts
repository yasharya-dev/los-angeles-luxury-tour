import { describe, expect, it } from 'vitest';
import { glue, isJapanese, phrases } from '../src/i18n/phrase';
import { offerings } from '../src/data/offerings';
import { plans } from '../src/data/plans';
import type { Text } from '../src/i18n/text';

// A string is split by the model; an array was split by hand.
const split = (text: Text) => (typeof text === 'string' ? [text] : []);

// Every Japanese string the cards and plan pages actually render.
const corpus = [
  ...offerings.flatMap((o) => [o.name.ja, o.blurb.ja]),
  ...plans.flatMap((p) => [
    ...split(p.title.ja),
    ...split(p.intro.ja),
    ...split(p.experience.body.ja),
    ...p.services.ja,
    ...p.details.flatMap((d) =>
      d.blocks.flatMap((b) => [...(b.paragraphs?.ja ?? []), ...(b.bullets?.ja ?? [])]),
    ),
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

  // The dictionary reads 安心して as 安 + 心して. A fold between two kanji on
  // its say-so put 安 at the end of one line and 心して at the start of the next.
  it('does not trust the dictionary between two kanji', () => {
    const parts = phrases(
      'お一人旅はもちろん、初めてロサンゼルスを訪れる方にも安心してお楽しみいただけるよう、日本語で丁寧にサポートいたします。',
    );
    expect(parts.join('|')).not.toContain('安|心');
    expect(parts.join('|')).toContain('安心して|お楽しみいただけるよう、');
  });

  // A space in Japanese is the author's own boundary. Her plan title folds
  // after 観戦 and nowhere else (brief of 2026-11-05); left to the model it
  // would also offer ドジャース|観戦 and プライベート|送迎.
  it('folds a spaced title at its space and nowhere else', () => {
    expect(phrases('ドジャース観戦 プライベート送迎')).toEqual([
      'ドジャース観戦 ',
      'プライベート送迎',
    ]);
    expect(phrases('テメキュラ ワイナリー1日旅')).toEqual(['テメキュラ ', 'ワイナリー1日旅']);
  });

  // A long side is still opened up, on its own.
  it('still splits a long side of a spaced line', () => {
    const parts = phrases('貸切プライベートツアー 6時間貸切・ガイドと専属ドライバー・LAX送迎対応');
    expect(parts.join('')).toBe('貸切プライベートツアー 6時間貸切・ガイドと専属ドライバー・LAX送迎対応');
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.some((part) => part.endsWith(' '))).toBe(true);
  });

  // 申し受けます is one verb. The dictionary reads it as 申し + 受け + ます, and a
  // fold there put 「別途申し」 at the end of a line.
  it('keeps a compound verb in one piece', () => {
    expect(phrases('※チケット代金は別途申し受けます。').join('|')).not.toContain('申し|受け');
    expect(phrases('ご希望に応じて、買い物への立ち寄りも可能です。').join('|')).not.toMatch(
      /買い\|物|立ち\|寄/,
    );
  });

  // A slash before a figure means "per": the unit after it stays whole, and
  // the fold goes before the slash.
  it('folds before a slash that means per, not after it', () => {
    expect(phrases('（$2,650〜）／1名様')).toEqual(['（$2,650〜）', '／1名様']);
    expect(phrases('／1グループ（1〜7名様）')[0]).toBe('／1グループ');
    expect(phrases('スタジアムツアー／プリゲームツアーも')).toEqual([
      'スタジアムツアー／',
      'プリゲームツアーも',
    ]);
  });

  // Thirteen characters with no seam of script in them: on a narrow card the
  // line ran out mid-word, 「…お申し込みくだ / さい。」.
  it('opens a long phrase before a polite prefix', () => {
    expect(phrases('ご希望の日程・人数などを入力してお申し込みください。').slice(-2)).toEqual([
      '入力して',
      'お申し込みください。',
    ]);
  });

  // An emoji, or a kanji outside the basic plane, is one character to a
  // reader and two units to a string. Counted in units it slipped through as
  // a phrase of its own.
  it('counts an emoji or a rare kanji as one character', () => {
    for (const text of ['東京 😀', '😀 東京', '𠮟 る', 'ロサンゼルスで😀']) {
      const parts = phrases(text);
      expect(parts.join(''), text).toBe(text);
      expect(parts.length, `${text}: ${parts.join('|')}`).toBe(1);
    }
  });

  // A middle dot between two items is a fair fold. Inside a name it is not.
  it('does not fold inside a name written with a middle dot', () => {
    expect(phrases('『ラ・ラ・ランド』のロケ地めぐり').join('|')).not.toMatch(/ラ・\|/);
    expect(phrases('ショッピング・レストラン予約').slice(0, 1)).toEqual(['ショッピング・']);
  });

  // A two-way arrow folds like a slash; an aside in brackets stays whole.
  it('folds after a two-way arrow, and never inside an aside in brackets', () => {
    expect(phrases('ご宿泊先⇔ドジャースタジアムの送迎')[0]).toBe('ご宿泊先⇔');
    expect(phrases('試合終了後のお迎え（往復・復路）').join('|')).not.toContain('往復・|');
  });

  it('keeps a number with its counter and a time range whole', () => {
    const parts = phrases('9:00〜18:00・ホテル発着・受賞ワイナリー3か所');
    expect(parts[0]).toBe('9:00〜18:00・');
    expect(parts.at(-1)).toBe('受賞ワイナリー3か所');
  });

  // The full site test of round 3 found these compounds cut in two, in both
  // engines: a seam before a one-kanji suffix, and one leaving a two-kanji
  // word on its own.
  it('keeps a suffix with its word, and a two-kanji word with its compound', () => {
    const joined = (text: string) => phrases(text).join('|');
    expect(joined('一夜限りの出張シェフ付きディナー体験')).not.toContain('シェフ|付き');
    expect(joined('一夜限りの出張シェフ付きディナー体験')).toContain('出張シェフ付き|ディナー体験');
    expect(joined('空港到着日やホテルチェックアウト後も、お荷物を')).not.toContain('|後');
    expect(joined('表示料金は、ご宿泊先⇔ドジャースタジアム間の送迎料金です。')).not.toContain('|間');
    expect(joined('ご利用人数・お荷物の量・訪問エリアなどにより、')).not.toContain('訪問|エリア');
    // A long compound still opens where both sides are words of their own.
    expect(joined('ドジャース観戦チケット購入代行')).toBe('ドジャース|観戦チケット|購入代行');
  });
});

// Chromium folds at a few characters inside a phrase even under keep-all.
// The word joiner (U+2060) between them is invisible and never folds.
describe('glue', () => {
  const WJ = String.fromCharCode(0x2060);
  const show = (s: string) => s.split(WJ).join('+');

  it('joins the characters Chromium folds at inside a phrase', () => {
    expect(show(glue('空港送迎（LAX⇔ホテル往復）'))).toBe('空港送迎（LAX+⇔+ホテル往復）');
    expect(show(glue('スタジアムツアー／'))).toBe('スタジアムツアー+／');
    expect(show(glue('1軒4〜6種ほどを'))).toBe('1軒4〜+6種ほどを');
    expect(show(glue('（1軒あたり$20〜）'))).toBe('（1軒あたり+$20〜）');
    expect(show(glue('LAXお迎え・'))).toBe('LAX+お迎え・');
  });

  it('leaves the ends of a phrase, where the fold between phrases is', () => {
    expect(glue('ご宿泊先⇔')).toBe('ご宿泊先' + WJ + '⇔');
    expect(glue('／1グループ')).toBe('／1グループ');
    expect(glue('約432,000円〜')).toBe('約432,000円〜');
    expect(glue('（$2,480〜）')).toBe('（$2,480〜）');
  });

  it('adds nothing but joiners, and nothing to English', () => {
    for (const text of ['空港送迎（LAX⇔ホテル往復）', 'セクション・座席の指定可', 'Private tours']) {
      expect(glue(text).split(WJ).join('')).toBe(text);
    }
    expect(glue('Private tours, by reservation only')).toBe('Private tours, by reservation only');
  });
});
