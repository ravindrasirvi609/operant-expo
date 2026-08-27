import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { InvoiceDocument } from "@/models/commercial";

export async function createInvoicePdf(invoice: InvoiceDocument, bookingNumber: string) {
  const document = await PDFDocument.create(); const page = document.addPage([595, 842]); const font = await document.embedFont(StandardFonts.Helvetica); const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("OPERANT EXPO", { x: 48, y: 770, size: 22, font: bold, color: rgb(0.24, 0.2, 0.8) }); page.drawText("INVOICE", { x: 48, y: 730, size: 20, font: bold }); page.drawText(`Invoice number: ${invoice.invoiceNumber}`, { x: 48, y: 700, size: 11, font }); page.drawText(`Booking: ${bookingNumber}`, { x: 48, y: 682, size: 11, font }); page.drawText(`Issued: ${invoice.issuedAt?.toISOString().slice(0, 10) ?? "-"}`, { x: 48, y: 664, size: 11, font }); page.drawText(`Subtotal: ${invoice.currency} ${invoice.subtotal.toFixed(2)}`, { x: 350, y: 600, size: 12, font }); page.drawText(`Tax: ${invoice.currency} ${invoice.tax.toFixed(2)}`, { x: 350, y: 580, size: 12, font }); page.drawText(`Fees: ${invoice.currency} ${invoice.fees.toFixed(2)}`, { x: 350, y: 560, size: 12, font }); page.drawText(`Total: ${invoice.currency} ${invoice.total.toFixed(2)}`, { x: 350, y: 520, size: 16, font: bold }); page.drawText("Thank you for booking with Operant Expo.", { x: 48, y: 100, size: 11, font, color: rgb(0.35, 0.35, 0.4) }); return document.save();
}

