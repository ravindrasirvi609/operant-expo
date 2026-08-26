import { randomUUID } from "node:crypto";

export type PaymentIntent = { provider: string; reference: string; status: "PENDING"; amount: number; currency: string };

export interface PaymentProvider { createPaymentIntent(input: { amount: number; currency: string; idempotencyKey: string }): Promise<PaymentIntent>; }

export class ManualPaymentProvider implements PaymentProvider {
  async createPaymentIntent(input: { amount: number; currency: string; idempotencyKey: string }) {
    return { provider: "manual", reference: `manual_${randomUUID()}`, status: "PENDING" as const, amount: input.amount, currency: input.currency };
  }
}

