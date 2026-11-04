// Text cleaning shared by validation (fields, file names) and the email subject.

/**
 * Invisible characters that change the direction of text: embeddings and overrides
 * (U+202A to U+202E), isolates (U+2066 to U+2069), the left and right marks (U+200E, U+200F) and
 * the Arabic letter mark (U+061C). One of them can make "x.pdf" read as "x.fdp" or reorder an
 * email address, so none is kept. Real Arabic or Hebrew letters are untouched.
 */
const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;

export const stripBidi = (s: string): string => s.replace(BIDI, '');
