// Content check for uploaded files. An extension proves nothing, so the first bytes are compared
// with what the format must start with. Formats without a reliable signature (IGES, DXF) are only
// checked against programs and archives that someone might rename to .dxf.
// shortcut: this recognises the format, it does not scan for malware. Add a scanner when the shop
// opens files automatically instead of by hand.

const text = (head: Uint8Array, length: number) =>
  new TextDecoder('latin1').decode(head.subarray(0, length));

const startsWith = (head: Uint8Array, ...bytes: number[]) => bytes.every((b, i) => head[i] === b);

function isProgramOrArchive(head: Uint8Array): boolean {
  return (
    startsWith(head, 0x4d, 0x5a) || // MZ: Windows program
    startsWith(head, 0x7f, 0x45, 0x4c, 0x46) || // ELF: Linux program
    startsWith(head, 0xcf, 0xfa, 0xed, 0xfe) || // Mach-O: macOS program
    startsWith(head, 0xfe, 0xed, 0xfa, 0xcf) ||
    startsWith(head, 0xca, 0xfe, 0xba, 0xbe) ||
    startsWith(head, 0x50, 0x4b) || // PK: zip, jar, office files
    startsWith(head, 0x23, 0x21) // #!: script
  );
}

const SIGNATURES: Record<string, (head: Uint8Array) => boolean> = {
  pdf: (h) => text(h, 1024).includes('%PDF-'), // the spec allows some bytes before the header
  step: (h) => text(h, 128).includes('ISO-10303-21'),
  dwg: (h) => /^(AC1|AC2|MC0)/.test(text(h, 4)),
};

/** A message when the file is not what its extension says, otherwise null. `name` is the original file name. */
export function contentProblem(name: string, head: Uint8Array): string | null {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const kind = ext === 'stp' ? 'step' : ext === 'igs' ? 'iges' : ext;
  if (!['pdf', 'step', 'dwg', 'dxf', 'iges'].includes(kind))
    return `"${name}" is not a supported file type.`;
  const fits = SIGNATURES[kind]
    ? SIGNATURES[kind](head)
    : !isProgramOrArchive(head) && head.length > 0;
  return fits ? null : `"${name}" does not look like a real ${kind.toUpperCase()} file.`;
}
