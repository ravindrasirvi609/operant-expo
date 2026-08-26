import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const maxBytes = 15 * 1024 * 1024;
let client: S3Client | undefined;

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 storage is not configured");
  return { bucket, publicBaseUrl: process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "") };
}

function getClient() {
  if (client) return client;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are not configured");
  client = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

export async function saveAsset(file: File, prefix = "assets") {
  const config = getR2Config();
  if (!allowedTypes.has(file.type)) throw new Error("Unsupported asset type");
  if (file.size > maxBytes) throw new Error("Asset exceeds the 15 MB limit");
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `${checksum}.${extension}`;
  const objectKey = `${prefix}/${key}`;
  await getClient().send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: bytes, ContentType: file.type, Metadata: { checksum, originalname: file.name } }));
  if (!config.publicBaseUrl) throw new Error("R2_PUBLIC_BASE_URL is not configured");
  return { key: objectKey, checksum, size: file.size, contentType: file.type, url: `${config.publicBaseUrl}/${objectKey}` };
}
