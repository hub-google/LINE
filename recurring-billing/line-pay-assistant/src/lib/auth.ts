import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

export type AuthUser = { userId: string; lineUid: string };

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

export function signUserToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret(), { expiresIn: "30d" });
}

export function getUserFromAuthHeader(req: NextRequest): AuthUser | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), jwtSecret()) as AuthUser;
  } catch {
    return null;
  }
}
