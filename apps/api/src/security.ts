import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const AES_ALGO = "aes-256-gcm";

export interface EncryptedBlob {
  iv: string;
  tag: string;
  ciphertext: string;
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  return hashPassword(password, salt) === expectedHash;
}

export function deriveMasterKey(masterSecret: string): Buffer {
  return scryptSync(masterSecret, "localai-master", 32);
}

export function encryptText(plainText: string, key: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(AES_ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptText(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(
    AES_ALGO,
    key,
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final()
  ]);
  return plaintext.toString("utf8");
}

export function encryptJson(
  payload: Record<string, unknown>,
  key: Buffer
): EncryptedBlob {
  return encryptText(JSON.stringify(payload), key);
}

export function decryptJson(
  blob: EncryptedBlob,
  key: Buffer
): Record<string, unknown> {
  return JSON.parse(decryptText(blob, key)) as Record<string, unknown>;
}
