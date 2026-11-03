// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/config/site.ts';

export default defineConfig({
  // Production URL, used for canonical links, OG tags and sitemap. Change when the domain is known.
  site: 'https://kilnworth-precision.vercel.app',
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Always ship CSS as files, so the CSP in vercel.json can stay free of 'unsafe-inline'.
    inlineStylesheets: 'never',
  },
  // Astro 7 defaults to 'jsx' whitespace rules, which drop spaces between inline tags in prose.
  compressHTML: true,
  vite: {
    // Same reason as inlineStylesheets: never inline scripts or assets as data:/inline blocks.
    build: { assetsInlineLimit: 0 },
  },
  // No sitemap while the site is noindex (src/config/site.ts), so the two never disagree.
  // og-card is only the source for public/og.png; keep it out of the sitemap.
  integrations: site.noindex ? [] : [sitemap({ filter: (page) => !page.includes('/og-card') })],
});
