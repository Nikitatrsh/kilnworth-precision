// robots.txt follows the noindex flag in src/config/site.ts, so a real launch is a one-line change.
import type { APIRoute } from 'astro';
import { site } from '../config/site';

export const GET: APIRoute = ({ site: base }) => {
  const body = site.noindex
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', base)}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
