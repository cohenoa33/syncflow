import type { Request, Response, NextFunction } from "express";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.DASHBOARD_API_KEY;


//   if (!expected) return next();

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : null;

  // (Optional) also accept x-api-key
  const key = token ?? (req.headers["x-api-key"] as string | undefined);

  if (!key || key !== expected) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing or invalid API key"
    });
  }

  next();
}
