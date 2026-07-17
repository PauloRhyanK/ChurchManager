import { randomBytes } from 'node:crypto';

/** Gera um token opaco URL-safe para links de cadastro e convites. */
export function generateAccessToken(): string {
  return randomBytes(32).toString('base64url');
}
