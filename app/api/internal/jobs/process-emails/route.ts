import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { sendQueuedEmail } from "@/lib/email";
import type { EmailEventDocument } from "@/models/commercial";

export async function POST(request: Request) {
  if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const database = await getDatabase(); const pending = await database.collection<EmailEventDocument>("emailEvents").find({ status: { $in: ["PENDING", "FAILED"] }, attempts: { $lt: 5 } }).sort({ createdAt: 1 }).limit(25).toArray();
  let processed = 0; for (const email of pending) { await sendQueuedEmail(database, email._id.toString()); processed += 1; }
  return NextResponse.json({ processed });
}
