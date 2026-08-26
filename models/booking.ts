import type { ObjectId } from "mongodb";

export type ExhibitorDocument = { _id?: ObjectId; organizationId: ObjectId; companyName: string; legalName?: string; contactPerson: string; email: string; phone?: string; address?: string; taxIdentifier?: string; createdAt: Date; updatedAt: Date };
export type ReservationHoldDocument = { _id?: ObjectId; organizationId: ObjectId; exhibitionId: ObjectId; hallId: ObjectId; stallId: ObjectId; status: "ACTIVE" | "EXPIRED" | "RELEASED"; expiresAt: Date; createdAt: Date; releasedAt?: Date };
export type BookingDocument = { _id?: ObjectId; organizationId: ObjectId; exhibitionId: ObjectId; hallId: ObjectId; stallId: ObjectId; exhibitorId: ObjectId; bookingNumber: string; status: "HELD" | "PAYMENT_PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED"; idempotencyKey?: string; commercialSnapshot: { basePrice: number; tax: number; fees: number; discounts: number; total: number; currency: string }; createdAt: Date; updatedAt: Date; };

