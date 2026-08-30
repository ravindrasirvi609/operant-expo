import { z } from "zod";

import { emailField, optionalText, requiredText } from "@/lib/validation/primitives";

export const exhibitorSchema = z.object({
  companyName: requiredText("Company name", { min: 2, max: 160 }),
  legalName: optionalText("Legal name", 160),
  contactPerson: requiredText("Contact person", { min: 2, max: 120 }),
  email: emailField,
  phone: optionalText("Phone", 40),
  address: optionalText("Address", 300),
  taxIdentifier: optionalText("Tax identifier", 80),
});

export const bookingSchema = exhibitorSchema.extend({
  stallId: z.string().trim().min(1, "A stall must be selected."),
});

export type ExhibitorInput = z.input<typeof exhibitorSchema>;
export type BookingInput = z.input<typeof bookingSchema>;
