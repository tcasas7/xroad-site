// src/middleware/fakeAuth.ts
import { Request, Response, NextFunction } from "express";

export function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  // 🔹 por ahora hardcodeamos el admin
  // luego esto lo rellenará el verdadero login
  (req as any).user = { id: "admin" };
  next();
}
