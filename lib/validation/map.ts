import { z } from "zod";

import {
  currencyField,
  nonNegativeNumber,
  optionalText,
  positiveNumber,
  requiredText,
} from "@/lib/validation/primitives";

export const MAP_ELEMENT_TYPES = ["STALL", "ENTRANCE", "EXIT", "ZONE", "STAGE", "WALKWAY"] as const;
export const STALL_TYPES = ["STANDARD", "PREMIUM", "CORNER", "ISLAND", "RAW_SPACE", "SHELL_SCHEME"] as const;
export const STALL_STATUSES = ["AVAILABLE", "PENDING", "BLOCKED", "HELD", "BOOKED"] as const;
export const VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;

/** Human labels for the stall type codes, so the UI never has to un-snake-case them itself. */
export const STALL_TYPE_LABELS: Record<(typeof STALL_TYPES)[number], string> = {
  STANDARD: "Standard",
  PREMIUM: "Premium",
  CORNER: "Corner",
  ISLAND: "Island",
  RAW_SPACE: "Raw space",
  SHELL_SCHEME: "Shell scheme",
};

export const floorPlanSchema = z.object({
  canvasWidth: positiveNumber("Canvas width", { max: 100_000 }),
  canvasHeight: positiveNumber("Canvas height", { max: 100_000 }),
  backgroundAssetId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export const rectGeometrySchema = z.object({
  type: z.literal("rect"),
  x: z.number().finite("Position must be a number.").nonnegative("Position cannot be negative."),
  y: z.number().finite("Position must be a number.").nonnegative("Position cannot be negative."),
  width: z.number().finite("Width must be a number.").positive("Width must be greater than zero."),
  height: z.number().finite("Height must be a number.").positive("Height must be greater than zero."),
  rotation: z.number().finite("Rotation must be a number.").optional(),
});

export const mapElementSchema = z.object({
  type: z.enum(MAP_ELEMENT_TYPES, { error: "Choose a valid element type." }),
  label: optionalText("Label", 120),
  status: z.enum(["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]).optional(),
  geometry: rectGeometrySchema,
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  zIndex: z.number().int("Layer must be a whole number.").default(1),
});

export const stallSchema = z.object({
  floorPlanElementId: z.string().trim().min(1, "Pick the stall rectangle this inventory item represents."),
  stallNumber: requiredText("Stall number", { min: 1, max: 40 }),
  section: optionalText("Section", 40),
  stallType: z.enum(STALL_TYPES, { error: "Choose a stall type." }),
  // Metres, matching hall dimensions. Area is derived server-side from these.
  width: positiveNumber("Width"),
  height: positiveNumber("Depth"),
  basePrice: nonNegativeNumber("Base price"),
  currency: currencyField,
  description: optionalText("Description", 500),
  amenities: z
    .array(requiredText("Amenity", { min: 1, max: 80 }))
    .max(20, "List at most 20 amenities.")
    .default([]),
  visibility: z.enum(VISIBILITIES, { error: "Choose whether this stall is public." }).default("PUBLIC"),
  status: z.enum(STALL_STATUSES, { error: "Choose a valid status." }).optional(),
});

export type StallInput = z.input<typeof stallSchema>;
export type MapElementInput = z.input<typeof mapElementSchema>;
