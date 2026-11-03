# Kilnworth Precision: design notes

This file is the source of truth for how the site looks. If the CSS and this file disagree, fix one of them.

## Concept: the drawing sheet

A contract machine shop lives on engineering drawings. Buyers send prints; the shop sends back parts that match them. So the site borrows the drawing sheet, not the factory floor:

- the home hero **is** a drawing: a part in orthographic view with dimension lines, a center line, a section hatch and a title block. The headline and the quote button sit inside the title block, where a print carries its part number and revision;
- data is shown the way a shop shows it: tables of envelopes, materials and tolerances, not icon cards;
- one accent color, **layout blue**, after the Dykem fluid machinists brush on metal before scribing lines into it.

The memorable thing is the hero drawing. Everything else stays quiet: plain paper, text, tables, thin rules.

## Palette

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--paper` | `#F3F5F4` | page background (cool, like drafting film; deliberately not cream) | |
| `--paper-2` | `#E5EAE9` | table headers, quiet bands | |
| `--grid` | `#D6DDDD` | drawing grid, only inside drawings and the hero | decoration |
| `--line` | `#AEB9BD` | decorative hairlines and table rules only | 1.8:1 (decoration, never the only cue) |
| `--line-strong` | `#76838A` | input and checkbox borders | 3.6:1 on paper, 3.9:1 on white (WCAG 1.4.11) |
| `--ink` | `#1C2428` | body text, object lines in drawings | 14.4:1 on paper |
| `--steel` | `#4F5C63` | secondary text, dimension lines | 6.3:1 on paper, 5.7:1 on paper-2 |
| `--blue` | `#1E3FAE` | links, primary button, tolerance callouts | 8.1:1 on paper, 8.8:1 white on blue, 6.9:1 on blue-wash |
| `--blue-deep` | `#152E80` | hover/pressed | 11.1:1 on paper |
| `--blue-wash` | `#DCE3F5` | selection, active filter chip background | |
| `--graphite` | `#20292E` | dark footer band | `#E4EAEA` on it 12.2:1, `#A8B5BA` on it 7.0:1 |
| `--error` | `#A3231B` | form errors only | 6.8:1 on paper |

Contrast values were computed with the WCAG relative luminance formula. No gradients anywhere.

## Type

- **Archivo** (variable, weight 100–900, width 62–125%, OFL, self-hosted via Fontsource). One family for everything with words. The width axis does the work a second family usually does:
  - display headings: width 112%, weight 620, tight tracking (-0.01em). Wide, flat letters read like an engraved machine nameplate;
  - body: width 100%, weight 400;
  - small labels (table headers, field hints): width 88%, weight 600, sentence case. No all-caps labels.
- **IBM Plex Mono** (400, 500) only for numbers a buyer would copy into a spec: tolerances, dimensions, quantities, lead times, part numbers. Never for decoration or eyebrows. Tabular figures.
- Scale: ratio 1.25 from 1.0625rem (17 px) body: 0.85, 1.0625, 1.33, 1.66, 2.07, 2.59, and the display size `clamp(2.4rem, 5.2vw, 4.4rem)`.
- Measure: body text max 68ch. Line height 1.55 for body, 1.08 for display.

## Layout

- 12-column grid inside a 1240 px max container, 24 px gutters (16 px on phones). Content is **left aligned**; nothing is centered except the 404 numeral.
- Sections are separated by space (`--space-section`), not by boxes. A hairline rule appears only where a table or a title block needs it.
- Home order answers the buyer's questions in order: can you make it (hero, capability table) → how tight (tolerance ruler) → prove it (work) → how do you check (quality) → how fast and how do I start (quote steps, RFQ band).

```
+--------------------------------------------------------------+
| demo strip                                                   |
| logo            Capabilities  Work  Quality  About  [Quote]  |
+--------------------------------------------------------------+
| A  1        2        3        4        5        6         A  |
|   +--------------------------------------------------+      |
|   |          part drawing (front + section)          |      |
|   |   <- 2.250 ±.0005 ->          A-A  ////           |      |
|   |                       +-----------------------+  |      |
|   |                       | title block: H1, lede,|  |      |
|   |                       | specs, Request a quote|  |      |
|   +-----------------------+-----------------------+--+      |
+--------------------------------------------------------------+
| What we machine     | table: process | envelope | tol |     |
+--------------------------------------------------------------+
```

On phones the title block drops under the drawing and becomes full width.

## Components

- **Button**: primary is solid layout blue with one 45° chamfered corner (clip-path), the only shape motif on the site; it reads as a machined edge break. Secondary is a text link with an underline. Min height 44 px.
- **Spec list** (`<dl>`): label left in narrow Archivo, value right in Plex Mono. Used in cases, title blocks and process pages.
- **Data table**: header row on `--paper-2`, rows separated by 1 px `--line`, numbers right-aligned in mono. On narrow screens tables scroll inside a container with a visible "scroll" hint and keep their first column sticky.
- **Drawing** (SVG): one stroke width (1.25 px, `vector-effect: non-scaling-stroke`). Line types follow ASME Y14.2 conventions: solid ink for visible edges, dashed for hidden, long-short dash for center lines, steel thin for dimensions, blue only for the tolerance being talked about. Section hatch at 45°.
- **Radius**: 2 px on inputs and chips (the edge break on a real part), 0 elsewhere. Nothing is rounder.
- **Focus**: 2 px solid `--blue` outline with 2 px offset, always visible on keyboard focus.

## Motion

- One orchestrated moment: on first load the hero drawing's dimension lines draw in (stroke-dashoffset, 900 ms total) after the part outline is already there. Skipped entirely under `prefers-reduced-motion: reduce`.
- Everything else moves only in response to the user: step changes in the quote form, filter results, the tolerance ruler. 150–200 ms, ease-out.
- No parallax, no scroll-triggered fade-ins, no carousels.

## What we do not do (and why)

- No purple/blue gradients, glows, glass blur, blobs: they say "template", and a machine shop has none of them.
- No identical three-up icon cards. Capabilities are a table because buyers compare numbers.
- No stock photos of people in hard hats, no faces at all (brief). The site carries on its own drawings; photos are optional extras.
- No all-caps eyebrows, no "→" glued to links, no middle-dot meta strings, no single highlighted word in headlines.
- No orange "industrial" accent and no cream background.
- No words like "world-class", "cutting-edge", "passionate". Numbers instead of adjectives.
- Mono font is not used for labels, only for values.

## Exceptions, justified

- Zero radius plus hairline rules is a common template look; here it is literal (drawing sheets have square borders and thin lines) and is offset by the grid, dimension lines and hatch, which a generic page never has.
- Capital letters appear only inside drawings ("SECTION A–A", "THRU", "CBORE"), because drawing lettering is uppercase by convention (ASME Y14.2). Page text and labels stay in sentence case.
- Operation numbers ("Op 10", "Op 20") are set in mono: they are identifiers a buyer sees on a shop router, like a part number, not decorative labels. They step by 10 because routers do, which also makes the sequence honest.
- Linear gradients are used once, in `.grid-paper`, to draw the 20 px drafting grid. They are rulings, not color washes.
- No photographs. The drawings carry the visual weight; machine-shop stock photos tend to show machine brands and look the same on every shop site.

## Where things live

- Tokens: `src/styles/tokens.css`. Line conventions for drawings: `src/components/drawings/drawing.css`.
- The hero drawing and its two crops: `src/components/drawings/HousingDrawing.astro`.
- Original SVG drawings (7): sensor housing, bone screw, valve manifold, shop floor plan, tolerance ruler, 404, logo mark.
