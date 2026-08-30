import { z } from "zod";

import { emailField, passwordField, requiredText, slugField } from "@/lib/validation/primitives";

export const credentialsSchema = z.object({
  email: emailField,
  password: passwordField,
});

export const registrationSchema = credentialsSchema.extend({
  name: requiredText("Your name", { min: 2, max: 120 }),
  organizationName: requiredText("Organization name", { min: 2, max: 160 }),
  organizationSlug: slugField,
});

export const invitationSchema = z.object({
  email: emailField,
  role: z.enum(["ORGANIZER_ADMIN", "ORGANIZER_STAFF", "MAP_EDITOR", "FINANCE"], {
    error: "Choose one of the available roles.",
  }),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
