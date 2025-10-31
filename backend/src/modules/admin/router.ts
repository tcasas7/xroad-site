import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middlewares/auth";
import bcrypt from 'bcryptjs';

const adminRouter = Router();

/** 🔒 Middleware para verificar que el usuario sea admin */
adminRouter.use(requireAuth, async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
});

/** ✅ GET /api/admin/users → lista todos los usuarios */
adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      pin: true,
      role: true,
      firstLoginDone: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return res.json({ ok: true, users });
});

/** ✅ POST /api/admin/users → crear usuario nuevo */
adminRouter.post("/users", async (req, res) => {
  try {
    const { pin, password, role } = req.body;

    if (!pin || !password || !role) {
      return res.status(400).json({ error: "missing_fields" });
    }

    // Validar que PIN tenga 5 dígitos
    if (!/^\d{5}$/.test(pin)) {
      return res.status(400).json({ error: "invalid_pin_format" });
    }

    const existing = await prisma.user.findUnique({ where: { pin } });
    if (existing) {
      return res.status(409).json({ error: "pin_already_exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        pin,
        passwordHash,
        role,
        firstLoginDone: false,
      },
    });

    return res.json({ ok: true, userId: newUser.id });
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

/** ✅ DELETE /api/admin/users/:id → eliminar usuario y relaciones */
adminRouter.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1️⃣ Eliminar info relacionada primero (providers, services, endpoints)
    await prisma.endpoint.deleteMany({ where: { userId: id } });
    await prisma.service.deleteMany({ where: { userId: id } });
    await prisma.provider.deleteMany({ where: { userId: id } });
    await prisma.userCertificate.deleteMany({ where: { userId: id } });
    await prisma.userPermissions.deleteMany({ where: { userId: id } });

    // 2️⃣ Eliminar usuario
    await prisma.user.delete({ where: { id } });

    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error eliminando usuario:", err);
    return res.status(500).json({ error: "delete_failed" });
  }
});




export { adminRouter };
