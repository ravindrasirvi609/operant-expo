export const ALLOWED_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_ASSET_BYTES = 15 * 1024 * 1024;

export type StoredAsset = {
  /** Storage key, unique per content. Also the public path segment for the local driver. */
  key: string;
  checksum: string;
  size: number;
  contentType: string;
  /** Where the browser fetches it from. */
  url: string;
};

export type AssetDriverName = "r2" | "local";

export type AssetDriver = {
  name: AssetDriverName;
  save: (input: { key: string; bytes: Buffer; contentType: string }) => Promise<{ url: string }>;
};

/**
 * A storage failure the user can act on, as opposed to an unexpected one.
 *
 * The asset route reports these verbatim, which is how "R2 storage is not configured" became a
 * bare 400 with no guidance. Carrying a flag lets the route say the upload is optional and the
 * plan can be created without it.
 */
export class AssetStorageError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, { recoverable = true }: { recoverable?: boolean } = {}) {
    super(message);
    this.name = "AssetStorageError";
    this.recoverable = recoverable;
  }
}

/**
 * Extension per supported content type, shared with the serving route so a stored key and the
 * `Content-Type` it is served with can never disagree.
 */
export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Content-addressed key, so re-uploading the same image cannot duplicate it.
 *
 * The extension comes from the validated content type rather than the uploaded filename: a name
 * with no dot at all previously produced its own text as the extension ("plan" -> ".plan"), which
 * the serving route could then not map back to a content type.
 */
export function buildAssetKey(prefix: string, checksum: string, contentType: string) {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "");
  return `${safePrefix}/${checksum}.${extension}`;
}

/** Guards the key used to read a stored file back, against traversal and absolute paths. */
export const ASSET_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

export function isSafeAssetKey(key: string) {
  return ASSET_KEY_PATTERN.test(key) && !key.includes("..") && !key.includes("//");
}
