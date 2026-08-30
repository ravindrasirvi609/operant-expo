import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { AssetStorageError, type AssetDriver } from "@/lib/storage/types";

let client: S3Client | undefined;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

/**
 * Reads the R2 configuration, or null when it is absent or incomplete.
 *
 * Returning null rather than throwing is what lets the caller fall back to local storage. The
 * public base URL is part of the requirement: without it a stored object has no URL a browser
 * could load, so treating R2 as "configured" would produce assets that upload and then 404.
 */
export function readR2Config(): R2Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicBaseUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function getClient(config: R2Config) {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}

export function createR2Driver(config: R2Config): AssetDriver {
  return {
    name: "r2",
    async save({ key, bytes, contentType }) {
      try {
        await getClient(config).send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: bytes,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      } catch (cause) {
        // Surfaced to the organizer because it is usually a credential or bucket-name mistake they
        // can fix — but the driver's own message can name internal hosts, so it goes to the log and
        // the caller gets the safe sentence.
        console.error("[storage] R2 upload failed:", cause);
        throw new AssetStorageError(
          "The upload was rejected by Cloudflare R2. Check the bucket name and credentials.",
          { recoverable: false },
        );
      }
      return { url: `${config.publicBaseUrl}/${key}` };
    },
  };
}
