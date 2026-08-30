import { describe, expect, it } from "vitest";

import { CONTENT_TYPE_BY_EXTENSION, buildAssetKey, isSafeAssetKey } from "@/lib/storage/types";

describe("buildAssetKey", () => {
  it("is content addressed, so the same image cannot be stored twice", () => {
    const checksum = "a".repeat(64);
    expect(buildAssetKey("organizations/abc", checksum, "image/png")).toBe(`organizations/abc/${checksum}.png`);
  });

  it("takes the extension from the content type, not the filename", () => {
    // A filename is caller-supplied text: it may carry no extension, the wrong one, or something
    // that maps to no content type at all when the file is served back.
    const checksum = "b".repeat(64);
    expect(buildAssetKey("assets", checksum, "image/jpeg")).toBe(`assets/${checksum}.jpg`);
    expect(buildAssetKey("assets", checksum, "image/svg+xml")).toBe(`assets/${checksum}.svg`);
  });

  it("falls back to a neutral extension for an unrecognised type", () => {
    const checksum = "c".repeat(64);
    expect(buildAssetKey("assets", checksum, "application/x-thing")).toBe(`assets/${checksum}.bin`);
  });

  it("normalises stray slashes in the prefix", () => {
    const checksum = "d".repeat(64);
    expect(buildAssetKey("/assets/", checksum, "image/png")).toBe(`assets/${checksum}.png`);
  });

  it("produces keys the safety check accepts and the serving route can type", () => {
    const checksum = "e".repeat(64);
    for (const contentType of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      const key = buildAssetKey("organizations/68f0", checksum, contentType);
      expect(isSafeAssetKey(key), key).toBe(true);
      expect(CONTENT_TYPE_BY_EXTENSION[key.split(".").pop()!]).toBe(contentType);
    }
  });
});

describe("isSafeAssetKey", () => {
  it("accepts the keys the driver generates", () => {
    expect(isSafeAssetKey(`organizations/68f/${"a".repeat(64)}.png`)).toBe(true);
  });

  it("rejects traversal attempts", () => {
    // The serving route resolves keys inside a fixed root; a key that walks upward must never get
    // as far as the filesystem.
    for (const key of ["../secrets.env", "assets/../../etc/passwd", "a/../../b.png", ".."]) {
      expect(isSafeAssetKey(key), key).toBe(false);
    }
  });

  it("rejects absolute paths and protocol-relative URLs", () => {
    for (const key of ["/etc/passwd", "//evil.example/x.png", "\\\\server\\share"]) {
      expect(isSafeAssetKey(key), key).toBe(false);
    }
  });

  it("rejects an empty key and one that is unreasonably long", () => {
    expect(isSafeAssetKey("")).toBe(false);
    expect(isSafeAssetKey("a".repeat(300))).toBe(false);
  });

  it("rejects characters that have no business in a storage key", () => {
    for (const key of ["a b.png", "a?b.png", "a#b.png", "a .png"]) {
      expect(isSafeAssetKey(key), JSON.stringify(key)).toBe(false);
    }
  });
});
