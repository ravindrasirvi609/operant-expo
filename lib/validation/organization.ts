import { z } from "zod";

import { requiredText, slugField } from "@/lib/validation/primitives";

export const organizationSchema = z.object({
  name: requiredText("Organization name", { min: 2, max: 160 }),
  slug: slugField,
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
