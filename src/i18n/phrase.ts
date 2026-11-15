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
// "A・B・C" fold item by item, and so is after ⇔ (A⇔B), but never inside
// brackets, where a short aside stays whole. A slash before a figure is not a list mark but
// "per" (／1名様), so there the fold goes before the slash and the unit
// stays whole. And a middle dot with a katakana run of one or two characters
// beside it is inside a name (ラ・ラ・ランド), not between two items.
//
// Neither source knows a compound verb: 申し受けます comes back as 申し|受けます.
// A fold is never placed between a verb's one-kana ending and the kanji that
// follows it (申し|受け, 立ち|寄り, 問い|合わせ, 買い|物).
//
// BudouX also leaves a long compound noun whole (ドジャース観戦チケット購入代行
// is one phrase), and a phrase wider than its column folds wherever it runs
// out. So a phrase over LONG characters may also fold at a word start inside
// it, but only where the script itself changes, which the eye already reads
// as a seam: kanji to katakana, katakana to kanji, into or out of a Latin
// word. Never between two characters of the same script, because the
// dictionary is not reliable there (it reads 安心して as 安|心して and ワイナリー
// as ワイ|ナ|リー); never next to a digit or a symbol (9:|00, 3|試合); never
// before hiragana, which would start a line on a particle; and never from
// hiragana into kanji, which is a prefix or an inflection (お|出迎え, 買い|物).
// One more seam the eye reads: a polite お or ご that starts a word after kana
// (入力して|お申し込みください, 安心して|お楽しみいただけるよう).
//
// A space inside Japanese text is different: the author put it there, so it
// is the boundary. Each side of it is taken on its own, and a side short
// enough to be one phrase stays whole. That is how a plan title folds exactly
// where Amelia asked (ドジャース観戦 プライベート送迎: after 観戦, never before
// 送迎), whatever the model would have proposed.
//
// Runs in Astro frontmatter only. Nothing here ships to the browser.

import { loadDefaultJapaneseParser } from 'budoux';

const parser = loadDefaultJapaneseParser();
const words = new Intl.Segmenter('ja', { granularity: 'word' });

const JAPANESE = /[぀-ヿ一-鿿]/;
const LIST_MARKS = new Set(['・', '／', '⇔']);
// Brackets: inside them a short aside stays whole, list marks and all.
const OPEN = new Set(['（', '(', '「', '『', '【']);
const CLOSE = new Set(['）', ')', '」', '』', '】']);
// Never start a line with one of these: closing marks and the long vowel bar.
const NO_START = /^[、。，．・：；？！）」』】〉》〕｝ー〜…ぁぃぅぇぉっゃゅょァィゥェォッャュョ]/;
/** Punctuation and brackets, which do not count toward a phrase's length. */
const MARKS = /[、。，．・：；？！（）「」『』【】〈〉《》〔〕｛｝／〜…⇔]/g;
/** A phrase longer than this may fold inside, between its words. */
const LONG = 10;

/** What a reader counts as its characters: marks and spaces aside, and an
    emoji or a rare kanji as one, though it takes two units of the string. */
const size = (piece: string) => [...piece.replace(MARKS, '').trim()].length;

const KANJI = /[一-鿿々]/;
// The one-kana endings that join two verb stems. No particles among them.
const JOINS = new Set([...'いきぎしちびみりえけげせべめれ']);
const DIGIT = /[0-9０-９]/;
// Letters and the long-vowel bar; not the middle dot, which is a list mark.
const KATAKANA = /[ァ-ヺー-ヿ]/;
const HIRAGANA = /[぀-ゟ]/;
const LATIN = /[A-Za-z]/;

type Script = 'kanji' | 'katakana' | 'hiragana' | 'latin' | 'other';
const scriptOf = (ch: string): Script =>
  KANJI.test(ch)
    ? 'kanji'
    : KATAKANA.test(ch)
      ? 'katakana'
      : HIRAGANA.test(ch)
        ? 'hiragana'
        : LATIN.test(ch)
          ? 'latin'
          : 'other';

/** Whether a long phrase may fold between these two characters. */
function seam(before: string, after: string): boolean {
  const [a, b] = [scriptOf(before), scriptOf(after)];
  if (a === 'other' || b === 'other') return false;
  if (a === b || b === 'hiragana') return false;
  if (a === 'hiragana' && b === 'kanji') return false;
  return true;
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

  // Each side keeps its space, so joining still gives the input back.
  const sides = text.split(/(?<= )/);
  const pieces =
    sides.length > 1
      ? sides.flatMap((side) => (side.trim().length <= LONG ? [side] : cut(side)))
      : cut(text);

  // A phrase of one character is exactly the stranded character this exists
  // to prevent (受賞ワイナリー3か|所). Fold it back into its neighbour.
  const out: string[] = [];
  for (const piece of pieces) {
    if (!piece) continue;
    if (size(piece) <= 1 && out.length > 0) out[out.length - 1] += piece;
    else if (out.length === 1 && size(out[0]) <= 1) out[0] += piece;
    else out.push(piece);
  }
  return out;
}

/** The model's and the dictionary's boundaries, for text with no spaces. */
function cut(text: string): string[] {
  if (!isJapanese(text)) return [text];

  const wordStarts = new Set<number>();
  for (const s of words.segment(text)) wordStarts.add(s.index);

  const cuts = new Set<number>();
  let at = 0;
  for (const chunk of parser.parse(text)) {
    at += chunk.length;
    if (at < text.length && wordStarts.has(at)) cuts.add(at);
  }
  // How many katakana run on from `at`, one way or the other.
  const kana = (at: number, step: 1 | -1) => {
    let n = 0;
    while (KATAKANA.test(text[at + n * step] ?? '')) n++;
    return n;
  };
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (OPEN.has(text[i])) depth++;
    else if (CLOSE.has(text[i])) depth = Math.max(0, depth - 1);
    if (!LIST_MARKS.has(text[i])) continue;
    // （往復・復路） folds as a whole, never after its dot.
    if (depth > 0) {
      cuts.delete(i + 1);
      continue;
    }
    const [before, after] = [kana(i - 1, -1), kana(i + 1, 1)];
    const inName = text[i] === '・' && before > 0 && after > 0 && Math.min(before, after) <= 2;
    const per = text[i] === '／' && DIGIT.test(text[i + 1]);
    if (inName || per) cuts.delete(i + 1);
    if (!inName) cuts.add(per ? i : i + 1);
  }

  // Kinsoku: a closing mark stays with what it closes. And a compound verb
  // stays in one piece.
  const compound = (cut: number) =>
    cut >= 2 && KANJI.test(text[cut - 2]) && JOINS.has(text[cut - 1]) && KANJI.test(text[cut]);
  const fair = (cut: number) => cut > 0 && !NO_START.test(text.slice(cut)) && !compound(cut);

  // Open up any phrase that is still too long to fit a card column.
  const edges = [0, ...[...cuts].filter(fair).sort((a, b) => a - b), text.length];
  for (let i = 0; i < edges.length - 1; i++) {
    const [start, end] = [edges[i], edges[i + 1]];
    if (end - start <= LONG) continue;
    for (const w of wordStarts) {
      if (w <= start || w >= end) continue;
      const polite = (text[w] === 'お' || text[w] === 'ご') && HIRAGANA.test(text[w - 1]);
      if (polite || seam(text[w - 1], text[w])) cuts.add(w);
    }
  }

  const pieces: string[] = [];
  let from = 0;
  for (const cut of [...cuts].filter(fair).sort((a, b) => a - b)) {
    pieces.push(text.slice(from, cut));
    from = cut;
  }
  pieces.push(text.slice(from));
  return pieces;
}
