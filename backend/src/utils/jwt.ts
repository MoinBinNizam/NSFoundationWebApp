import jwt from 'jsonwebtoken';
import { UserRole, AccountantType } from '../types/models.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  accountantType?: AccountantType | null;
}

/**
 * Returns the configured JWT secret or throws an error if missing.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return secret;
}

/**
 * Generates a signed JWT for an authenticated user.
 */
export function generateToken(payload: TokenPayload): string {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies a JWT token and decodes the payload.
 */
export function verifyToken(token: string): TokenPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as TokenPayload;
}
