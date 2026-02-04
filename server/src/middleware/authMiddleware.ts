import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";

export interface AuthedRequest extends Request {
  user?: { userId: string; organizationId: string; role: "gm" | "contractor"; fullName: string };
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Missing auth token"));
  const payload = verifyToken(header.slice("Bearer ".length));
  req.user = payload;
  next();
}

export function requireRole(role: "gm" | "contractor") {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Missing auth"));
    if (req.user.role !== role) return next(new HttpError(403, "Forbidden"));
    next();
  };
}
