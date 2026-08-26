import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(160),
  organizationSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const invitationSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["ORGANIZER_ADMIN", "ORGANIZER_STAFF", "MAP_EDITOR", "FINANCE"]),
});

