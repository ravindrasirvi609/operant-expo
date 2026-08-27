import type { Db } from "mongodb";
import type { ClientSession } from "mongodb";
import type { AuditLogDocument } from "@/models/audit";

export async function writeAudit(database: Db, event: Omit<AuditLogDocument, "_id" | "createdAt">, session?: ClientSession) {
  await database.collection<AuditLogDocument>("auditLogs").insertOne({ ...event, createdAt: new Date() }, session ? { session } : undefined);
}
