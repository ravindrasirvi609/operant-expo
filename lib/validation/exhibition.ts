import { z } from "zod";

const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const exhibitionFields = {
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  timezone: z.string().trim().min(1).max(80),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  venueId: z.string().optional(),
  bookingMode: z.enum(["DISABLED", "ONLINE", "WAITLIST", "REQUEST"]).default("DISABLED"),
};

export const exhibitionCreateSchema = z.object(exhibitionFields).refine((value) => value.endDate >= value.startDate, { message: "End date must be on or after start date", path: ["endDate"] });

export const exhibitionUpdateSchema = z.object(exhibitionFields).partial();

export const venueSchema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});

export const hallSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  width: z.coerce.number().positive().max(1_000_000),
  height: z.coerce.number().positive().max(1_000_000),
  level: z.string().trim().max(40).optional(),
  publicVisibility: z.boolean().default(true),
});
