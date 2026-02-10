import crypto from "node:crypto";

const SECRET = process.env.APP_CONFIG_SECRET || "";
if (!SECRET) {
  console.warn("[config] APP_CONFIG_SECRET is not set. Email credentials encryption will fail.");
}

function getKey() {
  if (!SECRET) throw new Error("APP_CONFIG_SECRET is not set");
  return crypto.createHash("sha256").update(SECRET).digest();
}

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [ivB64, dataB64, tagB64] = payload.split(":");
  if (!ivB64 || !dataB64 || !tagB64) throw new Error("Invalid secret payload");
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
