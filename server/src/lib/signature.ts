import crypto from "node:crypto";

export function sign(rawBody: Buffer | string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Constant-time check of an `X-Signature: sha256=<hex>` header against the exact raw body bytes. */
export function verifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(sign(rawBody, secret));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
