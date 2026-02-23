import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { VercelRequest } from "@vercel/node";

const getSecret = () => {
  const s = process.env.JWT_SECRET || process.env.SECRET_KEY || "xcreener-dev-secret-change-me";
  return new TextEncoder().encode(s);
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ sub: String(userId), username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<{ sub: string; username: string }> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as { sub: string; username: string };
}

export function getTokenFromRequest(req: VercelRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

export async function getUserIdFromRequest(req: VercelRequest): Promise<number | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    return parseInt(payload.sub, 10);
  } catch {
    return null;
  }
}

/** Require auth - returns userId or throws */
export async function requireAuth(req: VercelRequest): Promise<number> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    throw new AuthError("Invalid or expired token");
  }
  return userId;
}

export class AuthError extends Error {
  status = 401;
}
