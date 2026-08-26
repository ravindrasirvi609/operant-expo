import { MongoClient, type Db } from "mongodb";

import { env } from "@/lib/config";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
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
  const client = await getClientPromise();
  return client.db(env.MONGODB_DB_NAME);
}
