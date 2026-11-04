// Request number shown to the visitor and used in both emails: KP-YYMMDD-XXXXX.
// Not a secret and not stored anywhere: nothing is looked up by it.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

export function newRequestId(now: Date = new Date()): string {
  const day = now.toISOString().slice(2, 10).replaceAll('-', ''); // YYMMDD, UTC
  // 32 symbols divide 256 evenly, so `% 32` is unbiased.
  const suffix = Array.from(
    crypto.getRandomValues(new Uint8Array(5)),
    (b) => ALPHABET[b % 32],
  ).join('');
  return `KP-${day}-${suffix}`;
}
