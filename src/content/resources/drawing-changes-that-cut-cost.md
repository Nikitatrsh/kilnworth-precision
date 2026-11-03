---
title: Six drawing changes that cut machining cost
summary: Small edits to a print, made before the RFQ goes out, that routinely take 15 to 40 percent off a machined part without changing how it works.
published: 2026-09-14
author: Applications engineer
---

Most of the cost of a machined part is decided on the drawing, long before it reaches a machine. When we review a print for a quote, the same handful of features drive the price again and again. None of the changes below affect how a part works; they change how long it spends on a machine, how many setups it needs, and how much inspection it takes.

## 1. Give internal corners a radius a cutter can make

An end mill is round, so a pocket milled with it has round inside corners. A sharp internal corner on the print forces a second process (wire EDM or a broach), or a very small cutter running slowly.

- Make inside corner radii at least one third of the pocket depth. A 0.75 in deep pocket wants a 0.250 in radius or larger.
- Use the same radius on every pocket, so one tool does all of them.
- If a square corner is needed for a mating part, ask for a relief (a small circular cut-out in the corner) instead of a sharp corner.

## 2. Put tight tolerances only where they do something

A general tolerance in the title block applies to every dimension. If that block says ±0.001 in, every chamfer and clearance hole has to be held and inspected to that number.

- Set a sensible default in the title block, such as ±0.005 in for three-place decimals.
- Call out tighter values only on features that locate, seal or carry a bearing.
- Ask why when a tolerance tighter than ±0.0005 in appears. Sometimes it is copied from an older part.

Each step tighter roughly doubles the time spent finishing and measuring that feature.

## 3. Keep threads to a sensible depth

Thread strength comes almost entirely from the first few turns. Beyond about 1.5 times the diameter, extra depth adds time and the risk of a broken tap, not strength.

- Call out thread depth at 1.5 × diameter in steel, 2 × in aluminum.
- Use standard sizes and classes (2B internal, 2A external) unless there is a reason not to.
- Leave a short unthreaded relief at the bottom of blind holes so the tap does not bottom out.

## 4. Avoid deep, narrow features

Cutters deflect when they stick out far from the holder. A slot 0.125 in wide and 1 in deep needs a long, thin tool run at a fraction of normal speed.

- Keep pocket depth under four times the cutter diameter where possible.
- Keep drilled holes under ten times the diameter; beyond that we use gun drilling, which costs more.
- If a deep feature is essential, tell us in the notes so we can plan for it rather than discover it.

## 5. Use standard hole sizes

Standard drill and reamer sizes are always in the tool crib. A Ø0.2031 in hole is a 13/64 drill; a Ø0.2040 in hole needs a special reamer or a boring operation.

- Use fractional, letter, number or metric drill sizes for clearance and tap holes.
- Reserve odd sizes for press fits and bearing bores, and dimension them with a tolerance.

## 6. Design for fewer setups

Every time a part is unclamped and turned over, there is setup time and a chance to lose position between features.

- Put critical features on the same face, or on faces reachable in one 5-axis setup.
- Add a flat or a tab to hold onto if the part has no square edges, and say it can be cut off.
- Dimension features from datums that will be machined first.

## What to send

When you request a quote, send the 3D model (STEP) and a PDF of the drawing with tolerances. Add the quantity, any finishing, and a note on which features matter most. We will point out anything on this list that is driving the price and estimate what changing it would save.
