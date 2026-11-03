---
title: Tolerances on your RFQ, and why they change the price
summary: How a machine shop reads the tolerances on your drawing, what each one costs in time, and how to send a request that gets a firm price the first time.
published: 2026-10-02
author: Quality manager
---

When two shops quote the same part and the prices are far apart, the cause is often not the hourly rate. One shop read a tolerance as critical and planned extra operations and inspection; the other did not notice it. A clear drawing removes that guesswork and gets you prices you can compare.

## How we read a drawing

We look at the tolerances in a fixed order, because each one decides something different.

1. **Title block default.** This tells us how accurately every undimensioned feature has to be made. A default of ±0.005 in lets us cut most features in one pass. A default of ±0.001 in means a finishing pass and inspection on everything.
2. **Datums.** Datum letters (A, B, C) tell us how the part will be located when it is used and measured. We plan fixturing so the datums are machined first and everything else is cut relative to them.
3. **Tight individual tolerances.** Bores, fits and sealing faces with their own callouts get finishing passes, in-process checks and usually a CMM measurement.
4. **Geometric tolerances.** Position, flatness, perpendicularity and profile callouts tell us which relationships matter. A position tolerance of Ø0.002 in to datums A and B is often easier to hold than ±0.001 in on two separate coordinates, and it describes the function better.

## What tightness costs

Rough guide for a milled aluminum part, compared with a ±0.005 in feature:

| Tolerance | What changes | Relative time on that feature |
|---|---|---|
| ±0.005 in | One pass, checked with calipers | 1× |
| ±0.001 in | Finishing pass, checked with a micrometer or bore gauge | about 1.5× |
| ±0.0005 in | Finishing pass, tool wear compensation, CMM sample | about 2–3× |
| ±0.0002 in | Temperature-stable material, grinding or EDM, CMM every part | 4× or more |

These are not prices; they show why one tight callout on a feature that does not need it can move the quote.

## Surface finish

Surface finish is written as Ra in microinches (µin). 63 µin is a normal machined finish. 32 µin needs a finishing pass. 16 µin or less usually means a dedicated finishing tool or a secondary process. If the finish only matters on a sealing face, put the callout on that face, not in the title block.

## Material and heat treatment

Name the exact alloy and temper (for example, 7075-T651 rather than "aluminum"). For parts that are heat treated after machining, tell us the hardness and whether final dimensions apply before or after treatment, because heat treatment moves material.

## What a complete RFQ includes

- A 3D model (STEP or IGES) and a PDF drawing with the revision letter.
- Quantity, plus the quantities you might order later. Price per part drops sharply between 10 and 100 pieces.
- Material, finish and any coatings or platings, with the specification if you have one.
- Required documents: material certs, first article report, certificate of conformance.
- Target delivery date, or "best lead time".
- Which features matter most and why. Two sentences here save a day of questions.

## When we will call you

If a tolerance looks tighter than the function needs, or two callouts conflict, we ask before quoting rather than pricing the worst case. Most of the time the answer is quick, and the quote is lower and firmer for it.
