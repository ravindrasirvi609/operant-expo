import type { ClientSession, Db } from "mongodb";

/**
 * Runs `work` inside a MongoDB transaction, committing on success and aborting on any throw.
 *
 * The session is started from the client that owns the given `Db`, rather than fetched separately
 * from the connection module. The driver requires a session and its operations to come from the same
 * MongoClient — deriving it here makes that true by construction, instead of depending on two
 * accessors happening to return the same instance. It also means any `Db` works, so this is testable
 * against a throwaway database without configuring the environment.
 *
 * Requires a replica set; MongoDB does not support transactions on a standalone server.
 */
export async function withTransaction<T>(database: Db, work: (session: ClientSession) => Promise<T>) {
  const session = database.client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
