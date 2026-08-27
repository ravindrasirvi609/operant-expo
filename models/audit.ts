import type { ObjectId } from "mongodb";

export type AuditLogDocument = { _id?: ObjectId; organizationId?: ObjectId; actorId?: ObjectId; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown>; createdAt: Date };

