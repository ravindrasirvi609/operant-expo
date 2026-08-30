import { notFoundJson, serverError } from "@/lib/http/responses";
import { readLocalAsset } from "@/lib/storage";
import { AssetStorageError, CONTENT_TYPE_BY_EXTENSION, isSafeAssetKey } from "@/lib/storage/types";

/**
 * Serves assets held by the local storage driver.
 *
 * Only reachable for locally stored files; R2-backed assets are fetched straight from the bucket's
 * public URL and never pass through here. Keys are content hashes, so responses are immutable and
 * safe to cache indefinitely.
 *
 * SVGs are served with a restrictive CSP and as an attachment-safe type: an uploaded SVG is
 * untrusted markup that could otherwise execute script in the app's own origin.
 */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { key: segments } = await params;
    const key = segments.join("/");
    if (!isSafeAssetKey(key)) return notFoundJson("That asset could not be found.");

    const file = await readLocalAsset(key);
    if (!file) return notFoundJson("That asset could not be found.");

    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(file.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${file.checksum}"`,
      "X-Content-Type-Options": "nosniff",
    });

    if (contentType === "image/svg+xml") {
      headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }

    return new Response(new Uint8Array(file.bytes), { headers });
  } catch (cause) {
    if (cause instanceof AssetStorageError) return notFoundJson("That asset could not be found.");
    return serverError(cause, "GET /api/assets/[...key]");
  }
}
