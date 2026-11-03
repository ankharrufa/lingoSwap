// Answer checking. We compare "normalised" text so small differences don't count as wrong.
// - Case, extra spaces and punctuation are ignored.
// - Latin accents are ignored ("cafe" matches "café").
// - Arabic: harakat (short vowel marks) and tatweel are removed, and common letter
//   variants are treated as the same (أ إ آ ٱ → ا, ى → ي, ة → ه).

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const LATIN_MARKS = /[̀-ͯ]/g;
const PUNCTUATION = /[\p{P}\p{S}]/gu;

export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKD")
    .replace(LATIN_MARKS, "")
    .replace(ARABIC_MARKS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(PUNCTUATION, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(given: string, expected: string): boolean {
  const g = normalizeAnswer(given);
  return g.length > 0 && g === normalizeAnswer(expected);
}

// True when the text is mostly right-to-left (Arabic, Hebrew, Persian...).
export function isRtl(text: string): boolean {
  const rtl = (text.match(/[֐-ࣿ]/g) ?? []).length;
  const ltr = (text.match(/[A-Za-zÀ-ɏ]/g) ?? []).length;
  return rtl > ltr;
}
