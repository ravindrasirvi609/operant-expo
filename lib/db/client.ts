import { MongoClient, type Db } from "mongodb";

import { env } from "@/lib/config";
import { ensureAuthIndexes } from "@/lib/db/indexes";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
  var mongoDatabasePromise: Promise<Db> | undefined;
}

/**
 * One MongoClient for the whole process, in every environment.
 *
 * This used to cache the client only in development and return `new MongoClient(...)` on every call
 * in production, which broke transactions outright: `getDatabase()` cached a `Db` from the first
 * client, while `withTransaction` asked for a client again and got a fresh one, so the session came
 * from a different client than the operations it was passed to. The driver rejects that with
 * "ClientSession must be from the same MongoClient" and writes nothing — meaning every transactional
 * write (booking creation, floor-plan publish, stall creation, registration) failed under
 * NODE_ENV=production while working in development. It also opened a new connection pool per
 * transaction and never closed it.
 *
 * Caching is also the correct pattern for serverless: reusing the pool across invocations is the
 * point, not something to avoid.
 */
function getClientPromise() {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  global.mongoClientPromise ??= new MongoClient(env.MONGODB_URI).connect();
  return global.mongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  global.mongoDatabasePromise ??= getClientPromise().then(async (client) => {
    const database = client.db(env.MONGODB_DB_NAME);
    await ensureAuthIndexes(database);
    return database;
  });
  return global.mongoDatabasePromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return getClientPromise();
}
