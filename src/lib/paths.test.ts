import { expect, it } from 'vitest';
import { cleanPath } from './paths';

it('strips .html and index.html, keeps the root', () => {
  expect(cleanPath('/index.html')).toBe('/');
  expect(cleanPath('/')).toBe('/');
  expect(cleanPath('/capabilities.html')).toBe('/capabilities');
  expect(cleanPath('/capabilities/wire-edm.html')).toBe('/capabilities/wire-edm');
  expect(cleanPath('/work/')).toBe('/work');
});
