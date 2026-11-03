// Content schemas. If a Markdown/JSON file breaks a rule here, `npm run build` fails and says which field.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Inch values are strings ("0.0005") so the written precision is kept; see src/lib/units.ts.
const inch = z.string().regex(/^\d+(\.\d+)?$/, 'inch value like "2.250"');

const processes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/processes' }),
  schema: z.object({
    title: z.string(),
    order: z.number(), // position in tables and menus
    summary: z.string().max(160),
    // What the buyer compares: biggest part and tightest tolerance.
    envelope: z.array(z.object({ label: z.string(), value: inch })), // e.g. X travel, max diameter
    maxSize: inch, // largest single dimension, used by the capability filter
    toleranceStandard: inch,
    toleranceBest: inch,
    equipment: z.string(), // generic words only, no machine brands
    typicalLot: z.string(),
    materials: z.array(z.string()), // ids from materials.json
  }),
});

const materials = defineCollection({
  loader: file('./src/content/materials.json'),
  schema: z.object({
    name: z.string(),
    family: z.enum([
      'Aluminum',
      'Stainless steel',
      'Titanium',
      'Copper alloy',
      'Steel',
      'Nickel alloy',
      'Plastic',
    ]),
    note: z.string(),
  }),
});

const cases = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/cases' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    industry: z.enum(['Medical devices', 'Aerospace and defense', 'Industrial automation']),
    part: z.string(),
    material: z.string(),
    tolerance: inch,
    quantity: z.number().int().positive(),
    leadDays: z.number().int().positive(), // working days, PO to shipment
    result: z.string(), // one line with the number that mattered
    drawing: z.enum(['housing', 'shaft', 'manifold']), // which SVG from components/drawings
  }),
});

const resources = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/resources' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(200),
    published: z.coerce.date(),
    author: z.string(), // role only; people are fictional
  }),
});

export const collections = { processes, materials, cases, resources };
