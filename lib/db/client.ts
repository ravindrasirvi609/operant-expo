import { MongoClient, type Db } from "mongodb";

import { env } from "@/lib/config";
import { ensureAuthIndexes } from "@/lib/db/indexes";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
  var mongoDatabasePromise: Promise<Db> | undefined;
}

function getClientPromise() {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (process.env.NODE_ENV === "development") {
    global.mongoClientPromise ??= new MongoClient(env.MONGODB_URI).connect();
    return global.mongoClientPromise;
  }

  return new MongoClient(env.MONGODB_URI).connect();
}

export async function getDatabase(): Promise<Db> {
  if (global.mongoDatabasePromise) return global.mongoDatabasePromise;
  global.mongoDatabasePromise = getClientPromise().then(async (client) => {
    const database = client.db(env.MONGODB_DB_NAME);
    await ensureAuthIndexes(database);
    return database;
  });
  return global.mongoDatabasePromise;
}
