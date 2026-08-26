import { z } from "zod";

export const floorPlanSchema = z.object({
  canvasWidth: z.coerce.number().positive().max(100_000),
  canvasHeight: z.coerce.number().positive().max(100_000),
  backgroundAssetId: z.string().optional(),
});

export const mapElementSchema = z.object({
  type: z.enum(["STALL", "ENTRANCE", "EXIT", "ZONE", "STAGE", "WALKWAY"]),
  label: z.string().trim().max(120).optional(),
  status: z.enum(["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]).optional(),
  geometry: z.object({
    type: z.literal("rect"),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    rotation: z.number().finite().optional(),
  }),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  zIndex: z.number().int().default(1),
});

export const stallSchema = z.object({
  floorPlanElementId: z.string().min(1),
  stallNumber: z.string().trim().min(1).max(40),
  section: z.string().trim().max(40).optional(),
  stallType: z.enum(["STANDARD", "PREMIUM", "CORNER", "ISLAND", "RAW_SPACE", "SHELL_SCHEME"]),
  width: z.coerce.number().positive(),
  height: z.coerce.number().positive(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  amenities: z.array(z.string().trim().max(80)).max(20).default([]),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});
