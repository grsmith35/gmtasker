import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const endpoint = process.env.S3_ENDPOINT;        // set for R2 / MinIO, omit for AWS S3
const region = process.env.S3_REGION || "auto";  // R2 wants "auto"
const SIGNED_URL_TTL_SECONDS = Number(process.env.S3_SIGNED_URL_TTL || 900); // 15 minutes

export const usingObjectStorage = Boolean(bucket && accessKeyId && secretAccessKey);

const client = usingObjectStorage
  ? new S3Client({
      region,
      endpoint,
      // R2 and MinIO need path-style addressing; AWS S3 does not.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! }
    })
  : null;

const LOCAL_DIR = path.join(process.cwd(), "uploads");

/**
 * Stores an uploaded file and returns the value to persist on the attachment row.
 *
 * With object storage configured this is an opaque S3 *key*, not a URL: the bucket
 * is private, so a readable URL has to be signed at read time by signedUrl(). Without
 * the S3_* vars the file falls back to local disk and this returns a "/uploads/..."
 * path, which is what local dev has always done.
 */
export async function storeUpload(file: Express.Multer.File): Promise<string> {
  const key = `completions/${randomUUID()}${path.extname(file.originalname) || ""}`;

  if (!client || !bucket) {
    mkdirSync(LOCAL_DIR, { recursive: true });
    const filename = path.basename(key);
    writeFileSync(path.join(LOCAL_DIR, filename), file.buffer);
    return `/uploads/${filename}`;
  }

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));

  return key;
}

/**
 * Turns a stored key into something the browser can load. Local-disk paths are
 * already served by express.static, so they pass through untouched; S3 keys get a
 * short-lived presigned GET so the bucket itself can stay fully private.
 */
export async function signedUrl(stored: string): Promise<string> {
  if (!client || !bucket) return stored;
  if (stored.startsWith("/")) return stored;   // local-disk fallback path
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: stored }), {
    expiresIn: SIGNED_URL_TTL_SECONDS
  });
}

/** Signs the fileUrl on a set of attachment rows before they go out over the API. */
export async function signAttachments<T extends { fileUrl: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(rows.map(async (r) => ({ ...r, fileUrl: await signedUrl(r.fileUrl) })));
}
