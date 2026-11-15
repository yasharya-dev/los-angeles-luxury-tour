// Where a line of Japanese may fold.
//
// Japanese has no spaces, so a browser left to itself breaks a line between
// any two characters: ディ/ナー, 送迎付きツ/アー. That is normal in a long
// paragraph and wrong in a card, a heading or a button. This finds the
// places a reader would call natural, at build time, so every browser folds
// the same way (Safari has no `word-break: auto-phrase`).
//
// Two sources, and a boundary must satisfy both:
//  - BudouX, Google's phrase model, proposes phrase (bunsetsu) boundaries.
//  - ICU's dictionary, through Intl.Segmenter, knows where words start.
// BudouX is a small model and now and then cuts inside a word (空|港送迎);
// requiring a word start as well removes those. After a list mark (・ ／)
// is always a fair place too, which is what lets a card line written as
// "A・B・C" fold item by item.
//
// BudouX also leaves a long compound noun whole (ドジャース観戦チケット購入代行
// is one phrase), and a phrase wider than its column folds wherever it runs
// out. So a phrase over LONG characters may also fold at a word start inside
// it, but only at a change the eye already reads as a seam: kanji to
// katakana, katakana to kanji, into or out of a Latin word, or between two
// kanji words. ICU's dictionary is weak on katakana compounds and on numbers
// (ワイ|ナ|リー, 9:|00), so a fold never lands inside a katakana run, next to
// a digit or a symbol, after a hiragana prefix (お|出迎え, 買い|物), or after an
// opening bracket.
//
// Runs in Astro frontmatter only. Nothing here ships to the browser.

import { loadDefaultJapaneseParser } from 'budoux';

const parser = loadDefaultJapaneseParser();
const words = new Intl.Segmenter('ja', { granularity: 'word' });

const JAPANESE = /[぀-ヿ一-鿿]/;
const LIST_MARKS = new Set(['・', '／']);
// Never start a line with one of these: closing marks and the long vowel bar.
const NO_START = /^[、。，．・：；？！）」』】〉》〕｝ー〜…ぁぃぅぇぉっゃゅょァィゥェォッャュョ]/;
/** Punctuation and brackets, which do not count toward a phrase's length. */
const MARKS = /[、。，．・：；？！（）「」『』【】〈〉《》〔〕｛｝／〜…⇔]/g;
/** A phrase longer than this may fold inside, between its words. */
const LONG = 10;

const KANJI = /[一-鿿々]/;
// Letters and the long-vowel bar; not the middle dot, which is a list mark.
const KATAKANA = /[ァ-ヺー-ヿ]/;
const HIRAGANA = /[぀-ゟ]/;
const LATIN = /[A-Za-z]/;

/** Whether a long phrase may fold between these two characters. */
function seam(before: string, after: string): boolean {
  if (KATAKANA.test(before) && KATAKANA.test(after)) return false;
  if (HIRAGANA.test(before) && KANJI.test(after)) return false;
  const left = KANJI.test(before) || KATAKANA.test(before) || HIRAGANA.test(before) || LATIN.test(before);
  const right = KANJI.test(after) || KATAKANA.test(after) || LATIN.test(after);
  if (LATIN.test(before) && LATIN.test(after)) return false;
  return left && right;
}

/** True when the text has kana or kanji in it. English is left alone. */
export function isJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

/**
 * Split Japanese text into the phrases a line may fold between. Joining the
 * result gives back the input exactly. Text without Japanese comes back whole.
 */
export function phrases(text: string): string[] {
  if (!isJapanese(text)) return [text];

  const wordStarts = new Set<number>();
  for (const s of words.segment(text)) wordStarts.add(s.index);

  const cuts = new Set<number>();
  let at = 0;
  for (const chunk of parser.parse(text)) {
    at += chunk.length;
    if (at < text.length && wordStarts.has(at)) cuts.add(at);
  }
  for (let i = 0; i < text.length - 1; i++) {
    if (LIST_MARKS.has(text[i])) cuts.add(i + 1);
  }

  // Kinsoku: a closing mark stays with what it closes.
  const fair = (cut: number) => !NO_START.test(text.slice(cut));

  // Open up any phrase that is still too long to fit a card column.
  const edges = [0, ...[...cuts].filter(fair).sort((a, b) => a - b), text.length];
  for (let i = 0; i < edges.length - 1; i++) {
    const [start, end] = [edges[i], edges[i + 1]];
    if (end - start <= LONG) continue;
    for (const w of wordStarts) {
      if (w > start && w < end && seam(text[w - 1], text[w])) cuts.add(w);
    }
  }

  const pieces: string[] = [];
  let from = 0;
  for (const cut of [...cuts].filter(fair).sort((a, b) => a - b)) {
    pieces.push(text.slice(from, cut));
    from = cut;
  }
  pieces.push(text.slice(from));

  // A phrase of one character is exactly the stranded character this exists
  // to prevent (受賞ワイナリー3か|所). Fold it back into its neighbour.
  const out: string[] = [];
  for (const piece of pieces) {
    if (!piece) continue;
    const tiny = piece.replace(MARKS, '').trim().length <= 1;
    if (tiny && out.length > 0) out[out.length - 1] += piece;
    else if (out.length === 1 && out[0].replace(MARKS, '').trim().length <= 1) out[0] += piece;
    else out.push(piece);
  }
  return out;
}
