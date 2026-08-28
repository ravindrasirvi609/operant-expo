import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { setStallStatus } from "@/lib/stalls/availability";

function fakeDatabase() {
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const collection = vi.fn().mockReturnValue({ updateOne });
  return { db: { collection } as unknown as import("mongodb").Db, updateOne };
}

describe("setStallStatus", () => {
  it("never overwrites a manually BLOCKED stall", async () => {
    const { db, updateOne } = fakeDatabase();
    await setStallStatus(db, new ObjectId(), "AVAILABLE");
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $ne: "BLOCKED" } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "AVAILABLE" }) }),
      undefined,
    );
  });

  it("passes the session through when provided", async () => {
    const { db, updateOne } = fakeDatabase();
    const session = {} as import("mongodb").ClientSession;
    await setStallStatus(db, new ObjectId(), "HELD", session);
    expect(updateOne).toHaveBeenCalledWith(expect.anything(), expect.anything(), { session });
  });
});
