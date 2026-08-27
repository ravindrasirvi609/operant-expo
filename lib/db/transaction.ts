import type { ClientSession, Db } from "mongodb";
import { getMongoClient } from "@/lib/db/client";

export async function withTransaction<T>(database: Db, work: (session: ClientSession) => Promise<T>) {
  const session = (await getMongoClient()).startSession();
  try { return await session.withTransaction(() => work(session)); } finally { await session.endSession(); }
}
