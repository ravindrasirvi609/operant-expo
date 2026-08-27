import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { createInvoicePdf } from "@/lib/invoices/pdf";
import type { BookingDocument } from "@/models/booking";
import type { InvoiceDocument } from "@/models/commercial";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; invoiceId: string }> }) {
  const { organizationId, invoiceId } = await params; await requireOrganizationPermission(organizationId, "finance:view");
  if (!ObjectId.isValid(invoiceId)) return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
  const database = await getDatabase(); const invoice = await database.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId), organizationId: new ObjectId(organizationId) });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 }); const booking = await database.collection<BookingDocument>("bookings").findOne({ _id: invoice.bookingId });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 }); const pdf = await createInvoicePdf(invoice, booking.bookingNumber);
  return new NextResponse(pdf as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"` } });
}

