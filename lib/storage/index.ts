import { createHash } from "node:crypto";

import { localAssetDriver, assetStorageDirectory } from "@/lib/storage/local";
import { createR2Driver, readR2Config } from "@/lib/storage/r2";
import {
  ALLOWED_ASSET_TYPES,
  AssetStorageError,
  MAX_ASSET_BYTES,
  buildAssetKey,
  type AssetDriver,
  type AssetDriverName,
  type StoredAsset,
} from "@/lib/storage/types";

export { AssetStorageError } from "@/lib/storage/types";
export { readLocalAsset } from "@/lib/storage/local";
export type { StoredAsset } from "@/lib/storage/types";

/**
 * Picks the storage driver for this deployment.
 *
 * R2 wins when fully configured; otherwise files go to the local filesystem. There is deliberately
 * no third "unconfigured" outcome any more: requiring object storage for a background image is
 * what made floor-plan creation impossible on a workspace that had never set up R2, because the
 * plan form demanded an upload it could never complete.
 */
function resolveDriver(): AssetDriver {
  const r2 = readR2Config();
  return r2 ? createR2Driver(r2) : localAssetDriver;
}

export function assetStorageStatus(): { driver: AssetDriverName; detail: string } {
  const r2 = readR2Config();
  return r2
    ? { driver: "r2", detail: `Cloudflare R2 bucket ${r2.bucket}` }
    : { driver: "local", detail: `local directory ${assetStorageDirectory()}` };
}

export async function saveAsset(file: File, prefix = "assets"): Promise<StoredAsset> {
  if (!ALLOWED_ASSET_TYPES.has(file.type)) {
    throw new AssetStorageError(
      "That file type is not supported. Use a PNG, JPEG, WebP or SVG image.",
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    throw new AssetStorageError("That image is larger than the 15 MB limit.");
  }
  if (file.size === 0) {
    throw new AssetStorageError("That file is empty.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const key = buildAssetKey(prefix, checksum, file.type);

  const driver = resolveDriver();
  const { url } = await driver.save({ key, bytes, contentType: file.type });

  return { key, checksum, size: file.size, contentType: file.type, url };
}
