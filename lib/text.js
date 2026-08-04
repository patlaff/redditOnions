// Words that stay lowercase inside a title, but not at either end of it.
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of',
  'on', 'or', 'per', 'the', 'to', 'v', 'via', 'vs',
]);

/** Reddit titles are frequently shouted; anything mostly-caps gets flattened first. */
function isShouting(str) {
  const letters = str.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.6;
}

/**
 * Title-case a headline without mangling the things that make it readable.
 *
 * Words that carry an internal capital are left alone, so acronyms and brand
 * spellings survive ("NASA", "iPhone", "McDonald's") — unlike a naive
 * lowercase-then-capitalize pass, which renders them "Nasa" and "Iphone".
 */
export function titleCase(str) {
  if (typeof str !== 'string') return '';
  const flatten = isShouting(str);
  const words = str.split(/(\s+)/); // Keep the separators so spacing is preserved.
  const wordIndexes = words.map((w, i) => (w.trim() ? i : -1)).filter((i) => i >= 0);
  const firstWord = wordIndexes[0];
  const lastWord = wordIndexes.at(-1);

  return words
    .map((word, index) => {
      if (!word.trim()) return word;
      const candidate = flatten ? word.toLowerCase() : word;

      // Preserve deliberate capitalization (NASA, iPhone, eBay).
      if (!flatten && /[A-Z]/.test(candidate.slice(1))) return candidate;

      const lower = candidate.toLowerCase();
      const bare = lower.replace(/[^a-z]/g, '');
      if (MINOR_WORDS.has(bare) && index !== firstWord && index !== lastWord) return lower;

      // Capitalize after a leading quote or bracket, e.g. '"hello' -> '"Hello'.
      return lower.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join('');
}
