// With build.format 'file', Astro.url.pathname is "/about.html" at build time, while the site
// is served with clean URLs ("/about", Vercel cleanUrls). Use this wherever a path is shown.
export const cleanPath = (pathname: string) =>
  pathname.replace(/(index)?\.html$/, '').replace(/(.)\/$/, '$1') || '/';
