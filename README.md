# Kilnworth Precision: website for a contract CNC machine shop (portfolio demo)

**This is a portfolio demo.** Kilnworth Precision is a fictional company. Its address, phone, staff, customers, reviews and certifications are invented. Every page says so in a strip at the top and a line in the footer, and the site is set to `noindex`. Demo by Nikita Tarashenko.

It shows the kind of site we build for B2B manufacturers: one whose job is to turn an engineer's visit into a request for quote (RFQ).

![Home page, desktop](docs/screenshots/home-desktop.png)

What is on it:

- A home page built around an engineering drawing of a real-looking part, with the headline in the drawing's title block.
- A three-step quote form (part, requirements, contact) with file checks for STEP, IGES, DWG, DXF and PDF up to 25 MB. A buyer without a drawing can describe the part instead (then the description is required). **Nothing is sent**; it shows the confirmation a buyer would see.
- A capability explorer: pick material, part size and tolerance, see which processes fit. Filters live in the URL, so a link can be shared.
- A tolerance ruler that draws ±0.005 in to ±0.0002 in to scale against paper, a hair and a blood cell.
- An inch/mm switch for the whole site, remembered in the browser.
- A printable one-page capability sheet (print `/capabilities`).
- 22 pages: capabilities (5 processes), materials, industries, quality, 3 case studies, about, 2 articles, contact, privacy, 404.

Design notes and the reasoning behind them: [DESIGN.md](DESIGN.md). Security review: [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md). Fonts and image sources: [CREDITS.md](CREDITS.md).

## Run it locally

Needs Node 22.23.4 or newer (see `.nvmrc`).

```sh
npm install
npm run dev        # http://localhost:4321, reloads on save
```

Production build and a local preview of it:

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4321 (runs in the background)
npx astro preview stop
```

Checks (all should pass before a deploy):

```sh
npm run check        # TypeScript and Astro type check
npm test             # unit tests (units, tolerance ruler, filter, form validation)
npm run build && npm run check-links   # every internal link in dist/ resolves
npm audit            # dependency vulnerabilities
```

Screenshots and a sideways-scroll check (preview must be running):

```sh
npm run shoot                    # standard set into docs/screenshots/
npm run shoot -- /rfq 390 rfq.png  # one page at one width
npm run shoot -- --overflow      # every page at 360–1920 px, reports horizontal scroll
```

## Stack, and why

| Piece | Why |
|---|---|
| [Astro](https://astro.build) 7, static output | Ships HTML with almost no JavaScript (1.6–3 KB gzipped per page). Content lives in Markdown and JSON, separate from layout. Hosts free on Vercel. |
| TypeScript, strict | Content files are checked against schemas at build time; a typo in a case study fails the build with the field name. |
| Plain CSS with tokens | One `tokens.css` holds every color, size and space. No Tailwind or UI kit: this site needs its own visual system, and plain CSS is the easiest for the next person to read. |
| Vanilla TypeScript for the interactive parts | Four small scripts. The logic (filtering, unit conversion, validation) is in `src/lib/` as plain functions with unit tests. |
| Fontsource (Archivo, IBM Plex Mono) | Fonts are self-hosted: no requests to Google, faster first paint, simpler privacy. |
| Vitest | Fast tests for `src/lib/`. |

## Project layout

```
src/
  config/site.ts        name, phone, email, address, nav, demo/noindex flags   <- start here
  content/
    processes/*.md      one file per capability page (numbers in front matter, text below)
    cases/*.md          case studies
    resources/*.md      articles
    materials.json      materials table and form options
  content.config.ts     the rules each content file must follow
  pages/                one file per URL (pages/work/[slug].astro makes /work/<file name>)
  components/           layout pieces; drawings/ holds the SVG drawings; interactive/ the scripts
                        (small components keep styles in <style>; bigger ones in a sibling .css
                        file such as hero.css or rfq.css, every selector starting at the root class)
  lib/                  plain logic with tests next to it (*.test.ts)
  styles/               tokens.css, base.css, layout.css, print.css
public/                 favicon, og.png, boot.js (applies saved preferences before paint)
scripts/                check-links.mjs, shoot.mjs
vercel.json             security headers and clean URLs for Vercel
```

## Changing content

**Phone, email, address, hours, company name:** edit `src/config/site.ts`. Every page, the footer and the structured data read from there.

**Add a case study:** copy `src/content/cases/valve-manifold-316l.md` to a new file, for example `src/content/cases/pump-shaft-17-4.md`. Edit the front matter (title, industry, material, tolerance as a string like `'0.0005'`, quantity, leadDays, result, drawing) and the text. It appears on `/work`, on the home page and at `/work/pump-shaft-17-4`. `drawing` must be one of `housing`, `shaft`, `manifold`; a new drawing means a new component in `src/components/drawings/`.

**Edit a capability:** the numbers (envelope, tolerances, materials) are in the front matter of `src/content/processes/<name>.md`; the page text is below it. The home table, the explorer, the process page and the print sheet all update.

**Add a material:** add an entry to `src/content/materials.json` (`id`, `name`, `family`, `note`), then add its `id` to the `materials:` list of each process that can cut it.

**Add an article:** add a Markdown file to `src/content/resources/` with `title`, `summary`, `published` and `author`.

**Dimensions in inches:** write them as strings (`'2.250'`) so trailing zeros survive. Components show them in inches or millimeters depending on the visitor's choice. Numbers typed inside Markdown prose are plain text and do not switch units.

Run `npm run build` after editing: if a field is missing or wrong, the error names the file and field.

## Before using it for a real client

1. **Remove the demo labels and allow indexing.** In `src/config/site.ts` set `demo: false` and `noindex: false`. That removes the top strip and footer line and the `noindex` meta tag, turns on `sitemap-index.xml` (not generated while the site is noindex), and switches `robots.txt` to allow crawling with a sitemap link.
2. **Replace the fictional facts:** contacts in `site.ts`, the review in `src/components/home/Review.astro`, people in `src/pages/about.astro`, and the certification list in `src/components/home/Quality.astro` (link each real certificate).
3. **Set the real domain** in `astro.config.mjs` (`site:`), then regenerate the social image (below).
4. **Connect the quote form** (next section).

### Connecting a real form backend

The form already validates in the browser (`src/lib/rfq-validate.ts`) and builds the data with `FormData`. To send it, replace the demo block in `src/components/interactive/rfq.ts` (the part after the honeypot comment) with a `fetch` to one of:

- **A Vercel Function** (`api/rfq.ts`) that checks the fields again, stores files in Vercel Blob or S3, and emails the shop through Resend or Postmark. Needs accounts and API keys stored as Vercel environment variables, never in the code.
- **A form service** such as Formspree or Basin. Fastest, but check their file size limits (often below 25 MB) and where files are stored.

Either way the server must repeat every check (required fields, email format, allowed extensions, 25 MB limit, and the file's actual content, not just its name), drop requests where the hidden `website` field is filled, rate-limit by IP, and add the endpoint's origin to `connect-src` in the CSP in `vercel.json`. Update `/privacy` to say what is collected and for how long. Registering for any of these services is a decision for the site owner.

### Social preview image

`public/og.png` is a screenshot of `/og-card` (not linked, not in the sitemap). After design or headline changes:

```sh
npm run build && npm run preview
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1200,630 --screenshot=public/og.png http://localhost:4321/og-card
npm run build
```

## Deploying to Vercel (steps; not done for this demo)

1. Push the repository to GitHub (the owner decides the account and visibility).
2. In Vercel: **Add New Project**, import the repository. Vercel detects Astro; the defaults (build `npm run build`, output `dist`) are right.
3. Deploy. `vercel.json` adds the security headers (CSP, HSTS, frame and content-type protection) and clean URLs (`/about` instead of `/about.html`). HTTPS is automatic.
4. After the first deploy, check the headers with `curl -I https://<your-domain>/` and run the site through the browser console once to make sure the CSP blocks nothing.
5. For a custom domain, add it in Project Settings → Domains and update `site:` in `astro.config.mjs`.

## Licenses

- Code: MIT, see [LICENSE](LICENSE). This covers the source code only.
- Texts, the Kilnworth Precision name and brand, the visual design and the drawings are demo material for a fictional company: all rights reserved, not covered by the MIT license.
- Fonts: Archivo and IBM Plex Mono, SIL Open Font License 1.1, via Fontsource. See [CREDITS.md](CREDITS.md).
- No photographs are used; all illustrations are SVG drawn in code for this project.
