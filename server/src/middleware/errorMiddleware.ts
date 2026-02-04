import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/errors.js";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err as any;
  const status = e?.status ?? 500;
  const message = e?.message ?? "Server error";
  const details = e?.details;
  res.status(status).json({ error: { message, details } });
}
