import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }

  next();
}
