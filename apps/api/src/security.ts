import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { hash, verify, argon2id } from "argon2";

export interface SessionCredential {
  readonly token: string;
  readonly tokenHash: string;
  readonly csrfToken: string;
  readonly csrfHash: string;
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url").toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionCredential(): SessionCredential {
  const token = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  return {
    token,
    tokenHash: hashToken(token),
    csrfToken,
    csrfHash: hashToken(csrfToken),
  };
}

export function verifyTokenHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
