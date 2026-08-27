import type { ClientSession, Db } from "mongodb";

import type { EmailEventDocument } from "@/models/commercial";

export async function queueEmail(database: Db, event: Omit<EmailEventDocument, "_id" | "attempts" | "status" | "createdAt">, session?: ClientSession) {
  const email: EmailEventDocument = { ...event, status: "PENDING", attempts: 0, createdAt: new Date() };
  await database.collection<EmailEventDocument>("emailEvents").insertOne(email, session ? { session } : undefined);
  return email;
}

export async function sendQueuedEmail(database: Db, emailId: string) {
  const email = await database.collection<EmailEventDocument>("emailEvents").findOne({ _id: new (await import("mongodb")).ObjectId(emailId), status: { $in: ["PENDING", "FAILED"] } });
  if (!email?._id) return null;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return database.collection<EmailEventDocument>("emailEvents").updateOne({ _id: email._id }, { $set: { status: "FAILED", lastError: "RESEND_API_KEY is not configured" }, $inc: { attempts: 1 } });
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "Operant Expo <onboarding@resend.dev>", to: [email.recipient], subject: `Operant Expo: ${email.template}`, html: `<p>Your ${email.template} event has been recorded.</p>` }) });
  if (!response.ok) { await database.collection<EmailEventDocument>("emailEvents").updateOne({ _id: email._id }, { $set: { status: "FAILED", lastError: `Resend returned ${response.status}` }, $inc: { attempts: 1 } }); return null; }
  const result = await response.json() as { id?: string };
  await database.collection<EmailEventDocument>("emailEvents").updateOne({ _id: email._id }, { $set: { status: "SENT", providerId: result.id, sentAt: new Date() }, $inc: { attempts: 1 } });
  return result;
}
