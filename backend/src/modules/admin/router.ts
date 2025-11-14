import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middlewares/auth";
import bcrypt from 'bcryptjs';
import { requireAdmin } from "../../middlewares/isAdmin";
import { router } from "../auth/router";
import { logAction } from "../logs/logger";

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


adminRouter.get("/users/:id/permissions", async (req, res) => {
  const targetUserId = req.params.id;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, pin: true },
  });

  if (!targetUser) {
    return res.status(404).json({ error: "user_not_found" });
  }

  // Todos los providers con sus servicios (globales / del admin / etc.)
  const providers = await prisma.provider.findMany({
    include: {
      services: true,
    },
    orderBy: { displayName: "asc" },
  });

  // Permisos actuales del usuario
  const perms = await prisma.userServicePermission.findMany({
    where: { userId: targetUserId },
  });

  // Mapear permisos por providerId / serviceId
  const byProvider = new Map<string, { canView: boolean }>();
  const byService = new Map<
    string,
    { canView: boolean; canDownload: boolean }
  >();

  for (const p of perms) {
    if (p.providerId && !p.serviceId) {
      byProvider.set(p.providerId, { canView: p.canView });
    }
    if (p.serviceId) {
      byService.set(p.serviceId, {
        canView: p.canView,
        canDownload: p.canDownload,
      });
    }
  }

  // Respuesta estructurada para el frontend
  const result = providers.map((prov) => ({
    id: prov.id,
    displayName: prov.displayName,
    xRoadInstance: prov.xRoadInstance,
    memberClass: prov.memberClass,
    memberCode: prov.memberCode,
    subsystemCode: prov.subsystemCode,
    providerPermission: byProvider.get(prov.id) ?? { canView: false },
    services: prov.services.map((svc) => ({
      id: svc.id,
      serviceCode: svc.serviceCode,
      serviceVersion: svc.serviceVersion,
      servicePermission:
        byService.get(svc.id) ?? { canView: false, canDownload: false },
    })),
  }));

  return res.json({
    ok: true,
    user: targetUser,
    providers: result,
  });
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
      return res.status(400).json({ error: "invalid_legajo_format" });
    }

    const existing = await prisma.user.findUnique({ where: { pin } });
    if (existing) {
      return res.status(409).json({ error: "legajo_already_exists" });
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

    await logAction(req.auth!.userId, "CREATE_USER", `Legajo: ${newUser.pin}`);

    return res.json({ ok: true, userId: newUser.id });
  } catch (err) {
    console.error("❌ Error creando usuario:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});


adminRouter.post("/users/:id/permissions", async (req, res) => {
  const targetUserId = req.params.id;
  const adminId = req.auth!.userId;

  const { providerPermissions, servicePermissions } = req.body;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "user_not_found" });
  }

  // Limpiamos permisos anteriores del usuario
  await prisma.userServicePermission.deleteMany({
    where: { userId: targetUserId },
  });

  const dataToCreate: any[] = [];

  if (Array.isArray(providerPermissions)) {
    for (const p of providerPermissions) {
      if (!p.providerId) continue;
      if (!p.canView) continue; // si no puede ver, ni lo guardamos

      dataToCreate.push({
        userId: targetUserId,
        providerId: p.providerId,
        serviceId: null,
        canView: true,
        canDownload: false,
      });
    }
  }

  if (Array.isArray(servicePermissions)) {
    for (const s of servicePermissions) {
      if (!s.serviceId) continue;
      if (!s.canView && !s.canDownload) continue;

      dataToCreate.push({
        userId: targetUserId,
        serviceId: s.serviceId,
        canView: !!s.canView,
        canDownload: !!s.canDownload,
      });
    }
  }

  if (dataToCreate.length > 0) {
    await prisma.userServicePermission.createMany({
      data: dataToCreate,
    });
  }

  await logAction(
    adminId,
    "UPDATE_PERMISSIONS",
    `Actualizó permisos de usuario ${targetUser.pin}`
  );

  return res.json({ ok: true });
});


/** ✅ DELETE /api/admin/users/:id → eliminar usuario y relaciones */

adminRouter.delete("/users/:id", requireAuth, async (req, res) => {
  const { id } = req.params;


  try {
    // 1️⃣ Verificar que quien ejecuta es Admin
    const adminId = req.auth!.userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });


    if (!admin || admin.role !== "ADMIN") {
      return res.status(403).json({ error: "not_admin" });
    }


    // 2️⃣ Buscar el usuario a eliminar para obtener su PIN
    const userToDelete = await prisma.user.findUnique({ where: { id } });


    if (!userToDelete) {
      return res.status(404).json({ error: "user_not_found" });
    }


    const deletedPin = userToDelete.pin; // ✅ lo usamos para log


    // 3️⃣ Eliminar registros relacionados al usuario
    await prisma.endpoint.deleteMany({ where: { userId: id } });
    await prisma.service.deleteMany({ where: { userId: id } });
    await prisma.provider.deleteMany({ where: { userId: id } });
    await prisma.userCertificate.deleteMany({ where: { userId: id } });
    await prisma.userPermissions.deleteMany({ where: { userId: id } });
    await prisma.actionLog.deleteMany({ where: { userId: id } });


    // 4️⃣ Eliminar el usuario
    await prisma.user.delete({ where: { id } });


    // 5️⃣ Registrar en historial
    await prisma.actionLog.create({
      data: {
        userId: adminId,
        action: "DELETE_USER",
        detail: `Eliminó al usuario con Legajo: ${deletedPin}`,
      },
    });


    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error eliminando usuario:", err);
    return res.status(500).json({ error: "delete_failed" });
  }
});


// GET /api/admin/history
router.get('/history', requireAdmin, async (req, res) => {
  try {
    const logs = await prisma.actionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { pin: true, role: true } },
      },
    });

    return res.json({ ok: true, logs });
  } catch (err) {
    console.error("Error fetching logs:", err);
    return res.status(500).json({ ok: false, error: "history_fetch_failed" });
  }
});

adminRouter.get("/logs", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }

  const { from, to, action, includeHidden, pin } = req.query;
  const where: any = {};

  // Mostrar u ocultar logs escondidos
  if (!includeHidden) {
    where.hidden = false;
  }

  // Filtrar por acción
  if (action) {
    where.action = String(action);
  }

  // Filtrar por rango de fechas
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from as string);
    if (to) where.createdAt.lte = new Date(to as string);
  }

  if (pin) {
    where.user = {
      pin: String(pin),
    };
  }

if (from) {
  
  where.createdAt = { ...where.createdAt, gte: new Date(`${from}T00:00:00`) };
}
if (to) {
 
  where.createdAt = { ...where.createdAt, lte: new Date(`${to}T23:59:59.999`) };
}


  const logs = await prisma.actionLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { pin: true } },
    },
  });

  return res.json({ ok: true, logs });
});


adminRouter.post("/logs/hide", requireAuth, async (req, res) => {
  const adminId = req.auth!.userId;
  const admin = await prisma.user.findUnique({ where: { id: adminId } });

  if (!admin || admin.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }

  const { beforeDate } = req.body;
  if (!beforeDate) {
    return res.status(400).json({ error: "beforeDate_required" });
  }

  await prisma.actionLog.updateMany({
    where: {
      createdAt: { lt: new Date(beforeDate) },
    },
    data: { hidden: true },
  });

  await prisma.actionLog.create({
    data: {
      userId: adminId,
      action: "CLEAR_LOGS",
      detail: `Ocultó logs anteriores a ${beforeDate}`,
    },
  });

  return res.json({ ok: true });
});



export { adminRouter };
