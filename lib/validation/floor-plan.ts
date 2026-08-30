import { z } from "zod";

import { NUMBERING_SCHEMES } from "@/lib/floor-plans/geometry";
import { MAX_CANVAS_UNITS, MIN_CANVAS_UNITS, metresToUnits } from "@/lib/floor-plans/units";
import { rectGeometrySchema, STALL_TYPES, VISIBILITIES } from "@/lib/validation/map";
import {
  currencyField,
  nonNegativeNumber,
  optionalText,
  positiveNumber,
  requiredText,
} from "@/lib/validation/primitives";

const canvasDimension = (label: string) =>
  positiveNumber(label, { max: MAX_CANVAS_UNITS }).refine(
    (value) => value >= MIN_CANVAS_UNITS,
    `${label} must be at least ${MIN_CANVAS_UNITS} plan units.`,
  );

const objectIdField = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "That reference is not valid.");

export const floorPlanCreateSchema = z.object({
  canvasWidth: canvasDimension("Canvas width").optional(),
  canvasHeight: canvasDimension("Canvas height").optional(),
  gridSize: positiveNumber("Grid size", { max: 1000 }).optional(),
  backgroundAssetId: objectIdField.optional(),
});

export const floorPlanUpdateSchema = z
  .object({
    canvasWidth: canvasDimension("Canvas width"),
    canvasHeight: canvasDimension("Canvas height"),
    gridSize: positiveNumber("Grid size", { max: 1000 }),
    // Explicit null clears the background; omitting the key leaves it untouched.
    backgroundAssetId: objectIdField.nullable(),
  })
  .partial();

/** Commercial fields shared by single and bulk stall creation. */
const stallCommercialFields = {
  stallType: z.enum(STALL_TYPES, { error: "Choose a stall type." }),
  basePrice: nonNegativeNumber("Base price"),
  currency: currencyField,
  description: optionalText("Description", 500),
  amenities: z
    .array(requiredText("Amenity", { min: 1, max: 80 }))
    .max(20, "List at most 20 amenities.")
    .default([]),
  visibility: z.enum(VISIBILITIES, { error: "Choose whether this stall is public." }).default("PUBLIC"),
};

/**
 * Creating one stall on the plan.
 *
 * There is deliberately no width or height: a stall's footprint *is* its rectangle, converted from
 * plan units to metres server-side. Accepting both let a stall claim 3 m x 3 m while its rectangle
 * covered 10 m x 2 m, and nothing reconciled them.
 */
export const planStallCreateSchema = z.object({
  geometry: rectGeometrySchema,
  stallNumber: requiredText("Stall number", { min: 1, max: 40 }),
  section: optionalText("Section", 40),
  label: optionalText("Label", 120),
  ...stallCommercialFields,
});

export const planStallUpdateSchema = z
  .object({
    geometry: rectGeometrySchema,
    stallNumber: requiredText("Stall number", { min: 1, max: 40 }),
    section: optionalText("Section", 40),
    label: optionalText("Label", 120),
    locked: z.boolean(),
    visible: z.boolean(),
    status: z.enum(["AVAILABLE", "BLOCKED"], {
      error: "Only available and blocked can be set by hand; the rest follow bookings.",
    }),
    ...stallCommercialFields,
  })
  .partial();

/** Elements that are not stalls: entrances, exits, zones, stages and walkways. */
export const nonStallElementSchema = z.object({
  type: z.enum(["ENTRANCE", "EXIT", "ZONE", "STAGE", "WALKWAY"], {
    error: "Choose a valid element type. Use the stall endpoint to add a stall.",
  }),
  geometry: rectGeometrySchema,
  label: optionalText("Label", 120),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  zIndex: z.number().int("Layer must be a whole number.").default(0),
});

/** The grid generator — the fastest way to lay out a hall. */
export const bulkStallSchema = z.object({
  rows: positiveNumber("Rows", { max: 60, integer: true }),
  columns: positiveNumber("Columns", { max: 60, integer: true }),
  stallWidth: positiveNumber("Stall width", { max: MAX_CANVAS_UNITS }),
  stallHeight: positiveNumber("Stall depth", { max: MAX_CANVAS_UNITS }),
  gapX: nonNegativeNumber("Horizontal aisle", { max: MAX_CANVAS_UNITS }),
  gapY: nonNegativeNumber("Vertical aisle", { max: MAX_CANVAS_UNITS }),
  originX: nonNegativeNumber("Left offset", { max: MAX_CANVAS_UNITS }),
  originY: nonNegativeNumber("Top offset", { max: MAX_CANVAS_UNITS }),
  scheme: z.enum(NUMBERING_SCHEMES, { error: "Choose a numbering scheme." }),
  prefix: optionalText("Prefix", 12),
  start: positiveNumber("Starting number", { max: 9999, integer: true }).default(1),
  ...stallCommercialFields,
});

/** Bulk repricing from the inventory step. */
export const bulkPriceSchema = z.object({
  stallIds: z.array(objectIdField).min(1, "Select at least one stall.").max(500, "Select at most 500 stalls."),
  basePrice: nonNegativeNumber("Base price").optional(),
  currency: currencyField.optional(),
  stallType: z.enum(STALL_TYPES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

export const MAX_BULK_STALLS = 600;

/** Defaults for the grid dialog, in the units the schema expects. */
export const DEFAULT_BULK_REQUEST = {
  rows: 3,
  columns: 6,
  stallWidth: metresToUnits(3),
  stallHeight: metresToUnits(3),
  gapX: 0,
  gapY: metresToUnits(2),
  originX: metresToUnits(1),
  originY: metresToUnits(1),
  scheme: "ROW_LETTER" as const,
  start: 1,
};

export type FloorPlanCreateInput = z.infer<typeof floorPlanCreateSchema>;
export type PlanStallCreateInput = z.infer<typeof planStallCreateSchema>;
export type BulkStallInput = z.infer<typeof bulkStallSchema>;
