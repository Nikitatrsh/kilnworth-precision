import { describe, expect, it } from 'vitest';
import { contentProblem } from './file-check';

const bytes = (text: string) => new TextEncoder().encode(text);
const raw = (...b: number[]) => new Uint8Array(b);

describe('contentProblem', () => {
  it('accepts real headers of formats that have one', () => {
    expect(contentProblem('a.pdf', bytes('%PDF-1.7\n%âãÏÓ'))).toBeNull();
    expect(contentProblem('a.step', bytes('ISO-10303-21;\nHEADER;'))).toBeNull();
    expect(contentProblem('a.STP', bytes('﻿  ISO-10303-21;'))).toBeNull();
    expect(contentProblem('a.dwg', bytes('AC1032\u0000\u0000'))).toBeNull();
    expect(contentProblem('old.dwg', bytes('AC1.50'))).toBeNull();
    expect(contentProblem('a.dxf', bytes('  0\nSECTION\n  2\nHEADER'))).toBeNull();
    expect(contentProblem('a.iges', bytes('                S      1'))).toBeNull();
  });

  it('refuses a file whose content does not match its extension', () => {
    expect(contentProblem('part.step', raw(0x4d, 0x5a, 0x90, 0x00))).toBe(
      '"part.step" does not look like a real STEP file.',
    );
    expect(contentProblem('print.pdf', bytes('<html>not a pdf</html>'))).toBe(
      '"print.pdf" does not look like a real PDF file.',
    );
    expect(contentProblem('x.dwg', bytes('hello'))).toBe(
      '"x.dwg" does not look like a real DWG file.',
    );
  });

  it('refuses programs and archives under any extension', () => {
    const exe = raw(0x4d, 0x5a, 0x90, 0x00); // Windows program
    const elf = raw(0x7f, 0x45, 0x4c, 0x46); // Linux program
    const zip = raw(0x50, 0x4b, 0x03, 0x04);
    const macho = raw(0xcf, 0xfa, 0xed, 0xfe); // macOS program
    const script = bytes('#!/bin/sh\nrm -rf /');
    for (const head of [exe, elf, zip, macho, script]) {
      expect(contentProblem('part.dxf', head)).toBe(
        '"part.dxf" does not look like a real DXF file.',
      );
      expect(contentProblem('part.igs', head)).toBe(
        '"part.igs" does not look like a real IGES file.',
      );
    }
  });

  it('only looks at the last extension, so part.step.exe is not a STEP file', () => {
    expect(contentProblem('part.step.exe', bytes('ISO-10303-21;'))).toBe(
      '"part.step.exe" is not a supported file type.',
    );
  });

  it('refuses an empty head', () => {
    expect(contentProblem('a.pdf', new Uint8Array())).toContain('does not look like');
  });
});
