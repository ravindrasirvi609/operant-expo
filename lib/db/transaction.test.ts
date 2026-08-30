import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { withTransaction } from "@/lib/db/transaction";

let server: MongoMemoryReplSet;
let client: MongoClient;
let database: Db;

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  client = await new MongoClient(server.getUri()).connect();
  database = client.db("transaction_test");
}, 180_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

beforeEach(async () => {
  await database.collection("items").deleteMany({});
});

describe("withTransaction", () => {
  it("commits every write in the callback", async () => {
    await withTransaction(database, async (session) => {
      await database.collection("items").insertOne({ n: 1 }, { session });
      await database.collection("items").insertOne({ n: 2 }, { session });
    });

    expect(await database.collection("items").countDocuments({})).toBe(2);
  });

  it("rolls the whole callback back when it throws", async () => {
    await expect(
      withTransaction(database, async (session) => {
        await database.collection("items").insertOne({ n: 1 }, { session });
        throw new Error("halfway failure");
      }),
    ).rejects.toThrow("halfway failure");

    expect(await database.collection("items").countDocuments({})).toBe(0);
  });

  it("returns the callback's value", async () => {
    const result = await withTransaction(database, async () => "done");
    expect(result).toBe("done");
  });

  it("takes its session from the database it was given, not from global configuration", async () => {
    // The regression this guards: the session used to be started from a client fetched separately
    // from the connection module. In production that accessor returned a *new* MongoClient each
    // call, so the session and the operations belonged to different clients and the driver rejected
    // every transaction with "ClientSession must be from the same MongoClient" — writing nothing,
    // while development happened to work because it cached one client.
    //
    // A second, independent client proves there is no hidden dependency on the configured one.
    const other = await new MongoClient(server.getUri()).connect();
    try {
      const otherDatabase = other.db("transaction_test_other");
      await otherDatabase.collection("items").deleteMany({});

      await withTransaction(otherDatabase, async (session) => {
        await otherDatabase.collection("items").insertOne({ n: 99 }, { session });
      });

      expect(await otherDatabase.collection("items").countDocuments({})).toBe(1);
    } finally {
      await other.close();
    }
  });
});
