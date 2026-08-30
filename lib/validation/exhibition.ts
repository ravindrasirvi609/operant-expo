import { z } from "zod";

import { optionalText, positiveNumber, requiredText, slugField } from "@/lib/validation/primitives";

/**
 * Calendar date as `YYYY-MM-DD`, the value an `<input type="date">` produces.
 *
 * These fields used to be `z.coerce.date()`, whose Zod input type is `unknown` — unusable as a
 * form schema, which is why the form and the route validated different things. Keeping the wire
 * format a plain ISO date string lets one schema serve both; the route converts to a Date when
 * it writes. ISO dates also compare correctly as strings, so the end-after-start rule needs no
 * parsing.
 */
function isRealCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.parse("2027-02-31") succeeds and rolls over to 3 March, so comparing the components
  // back is the only way to reject a day that does not exist in that month.
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const isoDateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD.")
  .refine(isRealCalendarDate, "That date does not exist.");

export const BOOKING_MODES = ["DISABLED", "ONLINE", "WAITLIST", "REQUEST"] as const;

const exhibitionFields = {
  name: requiredText("Exhibition name", { min: 2, max: 160 }),
  slug: slugField,
  shortDescription: optionalText("Short description", 300),
  description: optionalText("Description", 10_000),
  timezone: requiredText("Timezone", { min: 1, max: 80 }),
  startDate: isoDateField,
  endDate: isoDateField,
  venueId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  bookingMode: z.enum(BOOKING_MODES, { error: "Choose how visitors may book." }).default("DISABLED"),
};

const endsAfterStart = {
  check: (value: { startDate: string; endDate: string }) => value.endDate >= value.startDate,
  message: "The end date must be on or after the start date.",
} as const;

export const exhibitionCreateSchema = z
  .object(exhibitionFields)
  .refine(endsAfterStart.check, { message: endsAfterStart.message, path: ["endDate"] });

export const exhibitionUpdateSchema = z
  .object(exhibitionFields)
  .partial()
  // On a partial update the rule only applies when both dates are present in the payload.
  .refine((value) => !value.startDate || !value.endDate || endsAfterStart.check(value as { startDate: string; endDate: string }), {
    message: endsAfterStart.message,
    path: ["endDate"],
  });

export const venueSchema = z.object({
  name: requiredText("Venue name", { min: 2, max: 160 }),
  address: optionalText("Address", 300),
  city: optionalText("City", 100),
  country: optionalText("Country", 100),
});

export const hallSchema = z.object({
  name: requiredText("Hall name", { min: 2, max: 120 }),
  code: z
    .string()
    .trim()
    .min(1, "Hall code is required.")
    .max(40, "Hall code must be at most 40 characters.")
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens and underscores only — no spaces."),
  // Metres. The floor-plan canvas derives its coordinate space from these, at 20 plan units per
  // metre, so a hall measured here in the wrong unit produces a canvas of the wrong size.
  width: positiveNumber("Width", { max: 100_000 }),
  height: positiveNumber("Depth", { max: 100_000 }),
  level: optionalText("Level", 40),
  publicVisibility: z.boolean().default(true),
});

export type ExhibitionInput = z.input<typeof exhibitionCreateSchema>;
export type VenueInput = z.input<typeof venueSchema>;
export type HallInput = z.input<typeof hallSchema>;
