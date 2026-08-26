import type { ObjectId } from "mongodb";

export type PaymentDocument = { _id?: ObjectId; organizationId: ObjectId; bookingId: ObjectId; provider: string; status: "INITIATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED"; amount: number; currency: string; providerReference?: string; idempotencyKey?: string; createdAt: Date; updatedAt: Date };
export type InvoiceDocument = { _id?: ObjectId; organizationId: ObjectId; bookingId: ObjectId; invoiceNumber: string; status: "DRAFT" | "ISSUED" | "PAID" | "VOID"; subtotal: number; tax: number; fees: number; total: number; currency: string; issuedAt?: Date; createdAt: Date };
export type EmailEventDocument = { _id?: ObjectId; organizationId?: ObjectId; bookingId?: ObjectId; recipient: string; template: string; status: "PENDING" | "SENT" | "FAILED"; providerId?: string; attempts: number; lastError?: string; createdAt: Date; sentAt?: Date };

