import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AssetStorageError, isSafeAssetKey, type AssetDriver } from "@/lib/storage/types";

/**
 * Filesystem asset driver, for development and self-hosted deployments with no object storage.
 *
 * Files go to `ASSET_STORAGE_DIR` (default `.uploads/`) and are served by the
 * `GET /api/assets/[...key]` route — deliberately *not* `public/`, which is copied at build time
 * and is not writable at runtime in a production build, so anything written there after a build
 * would silently 404.
 */
export function assetStorageDirectory() {
  return path.resolve(process.cwd(), process.env.ASSET_STORAGE_DIR ?? ".uploads");
}

/** Resolves a key inside the storage root, refusing anything that escapes it. */
function resolveWithinRoot(key: string) {
  if (!isSafeAssetKey(key)) {
    throw new AssetStorageError("That asset path is not valid.", { recoverable: false });
  }

  const root = assetStorageDirectory();
  const resolved = path.resolve(root, key);
  // Belt and braces: the key pattern already rejects "..", but a symlinked or oddly-cased path
  // must not be able to read outside the store either.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new AssetStorageError("That asset path is not valid.", { recoverable: false });
  }
  return resolved;
}

export const localAssetDriver: AssetDriver = {
  name: "local",
  async save({ key, bytes }) {
    const destination = resolveWithinRoot(key);
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    } catch (cause) {
      console.error("[storage] local write failed:", cause);
      throw new AssetStorageError(
        `Could not write to the local asset store at ${assetStorageDirectory()}. Set ASSET_STORAGE_DIR to a writable directory, or configure Cloudflare R2.`,
        { recoverable: false },
      );
    }
    return { url: `/api/assets/${key}` };
  },
};

export type LocalAssetFile = { bytes: Buffer; checksum: string };

/** Reads a stored file back for the serving route. Returns null when it is not there. */
export async function readLocalAsset(key: string): Promise<LocalAssetFile | null> {
  const source = resolveWithinRoot(key);
  try {
    const bytes = await readFile(source);
    return { bytes, checksum: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return null;
  }
}
