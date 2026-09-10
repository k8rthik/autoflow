/** Normalises quotes, dashes and whitespace so a faithful excerpt still matches after model re-encoding. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** True when the excerpt appears verbatim (modulo punctuation encoding) in the memo. */
export const excerptGrounded = (memo: string, excerpt: string): boolean => {
  const needle = normalise(excerpt);
  return needle.length > 0 && normalise(memo).includes(needle);
};
