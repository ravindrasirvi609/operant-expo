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

