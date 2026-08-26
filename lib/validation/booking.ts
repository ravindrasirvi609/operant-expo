import { z } from "zod";

export const exhibitorSchema = z.object({ companyName: z.string().trim().min(2).max(160), legalName: z.string().trim().max(160).optional(), contactPerson: z.string().trim().min(2).max(120), email: z.string().trim().email(), phone: z.string().trim().max(40).optional(), address: z.string().trim().max(300).optional(), taxIdentifier: z.string().trim().max(80).optional() });
export const bookingSchema = exhibitorSchema.extend({ stallId: z.string().min(1) });

