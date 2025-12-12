import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middlewares/auth";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../../middlewares/isAdmin";
import { router } from "../auth/router";
import { logAction } from "../logs/logger";
import multer from "multer";
import tls from "tls";
import { encryptAesGcm } from "../../core/crypto/aesgcm";
import {
  parsePkcs12Meta,
  getCertFingerprintSubjectDates,
} from "../../core/mtls/agentFactory";
import { clearAgent } from "../../core/mtls/agentCache";

const adminRouter = Router();
const certUpload = multer({ storage: multer.memoryStorage() });

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

// ✅ GET /api/admin/users/:id/certificate → metadata del certificado de un usuario
adminRouter.get("/users/:id/certificate", requireAuth, async (req, res) => {
  try {
    const adminId = req.auth!.userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden" });
    }

    const userId = req.params.id;

    const cert = await prisma.userCertificate.findUnique({
      where: { userId },
      select: {
        id: true,
        fingerprint: true,
        subject: true,
        notBefore: true,
        notAfter: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!cert) {
      return res.json({ ok: true, hasCert: false });
    }

    return res.json({
      ok: true,
      hasCert: true,
      cert,
    });
  } catch (err) {
    console.error("ADMIN GET certificate error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "admin_certificate_fetch_failed" });
  }
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

  // Todos los providers con sus servicios y endpoints
  const providers = await prisma.provider.findMany({
    include: {
      services: {
        include: { endpoints: true },   // NECESARIO PARA VER ARCHIVOS
      },
    },
    orderBy: { displayName: "asc" },
  });

  // Permisos actuales del usuario (provider / service)
  const perms = await prisma.userServicePermission.findMany({
    where: { userId: targetUserId },
  });

  // Permisos por archivo
  const filePerms = await prisma.userFilePermission.findMany({
    where: { userId: targetUserId },
  });

  // Mapear permisos
  const byProvider = new Map<string, { canView: boolean }>();
  const byService = new Map<
    string,
    { canView: boolean; canDownload: boolean; canUpload: boolean }
  >();

  const byFile = new Map<
    string,
    { filename: string; canView: boolean; canDownload: boolean }[]
  >();

  // Agrupar permisos de archivo por serviceId
  for (const fp of filePerms) {
    if (!byFile.has(fp.serviceId)) byFile.set(fp.serviceId, []);
    byFile.get(fp.serviceId)!.push({
      filename: fp.filename,
      canView: fp.canView,
      canDownload: fp.canDownload,
    });
  }

  // Servicio y provider
  for (const p of perms) {
    if (p.providerId && !p.serviceId) {
      byProvider.set(p.providerId, { canView: p.canView });
    }
    if (p.serviceId) {
      byService.set(p.serviceId, {
        canView: p.canView,
        canDownload: p.canDownload,
        canUpload: p.canUpload ?? false,
      });
    }
  }

  // Construcción RESULTADO FINAL para el front
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
        byService.get(svc.id) ?? {
          canView: false,
          canDownload: false,
          canUpload: false,
        },

      endpoints: svc.endpoints, // NECESARIO PARA CARGAR LISTA DE ARCHIVOS

      filePermissions: byFile.get(svc.id) ?? [], // PERMISOS POR ARCHIVO
    })),
  }));

  return res.json({
    ok: true,
    user: targetUser,
    providers: result,
  });
});

// ✅ POST /api/admin/users/:id/certificate → subir o reemplazar certificado de un usuario
adminRouter.post(
  "/users/:id/certificate",
  requireAuth,
  certUpload.single("p12"),
  async (req, res) => {
    try {
      const adminId = req.auth!.userId;
      const admin = await prisma.user.findUnique({ where: { id: adminId } });
      if (!admin || admin.role !== "ADMIN") {
        return res.status(403).json({ error: "forbidden" });
      }

      const userId = req.params.id;
      const { passphrase = "" } = req.body || {};

      if (!req.file) {
        return res.status(400).json({ error: "p12_required" });
      }

      // Validar que el P12 se pueda abrir
      try {
        tls.createSecureContext({ pfx: req.file.buffer, passphrase });
      } catch {
        return res.status(400).json({ error: "invalid_p12_or_passphrase" });
      }

      // Extraer metadata del certificado
      const certObj = parsePkcs12Meta(req.file.buffer, passphrase);
      const meta = getCertFingerprintSubjectDates(certObj);

      // Cifrar P12 + passphrase
      const masterKey = Buffer.from(process.env.MASTER_KEY!, "hex");
      const encP12 = encryptAesGcm(req.file.buffer, masterKey);
      const encPass = encryptAesGcm(Buffer.from(passphrase, "utf8"), masterKey);

      // Guardar en DB con upsert
      await prisma.userCertificate.upsert({
        where: { userId },
        update: {
          p12Encrypted: encP12.ciphertext,
          iv: encP12.iv,
          authTag: encP12.authTag,
          passEncrypted: encPass.ciphertext,
          passIv: encPass.iv,
          passAuthTag: encPass.authTag,
          fingerprint: meta.fingerprint,
          subject: meta.subject,
          notBefore: meta.notBefore,
          notAfter: meta.notAfter,
        },
        create: {
          userId,
          p12Encrypted: encP12.ciphertext,
          iv: encP12.iv,
          authTag: encP12.authTag,
          passEncrypted: encPass.ciphertext,
          passIv: encPass.iv,
          passAuthTag: encPass.authTag,
          fingerprint: meta.fingerprint,
          subject: meta.subject,
          notBefore: meta.notBefore,
          notAfter: meta.notAfter,
        },
      });

      // Limpiar cache de agente mTLS
      clearAgent(`userCert_${userId}`);

      // Log de acción
      await logAction(
        adminId,
        "UPLOAD_CERT_ADMIN",
        `Reemplazó certificado del usuario ${userId}`
      );

      return res.json({ ok: true, meta });
    } catch (e: unknown) {
      const err = e as Error;
      console.error("ADMIN cert upload error:", err.message || err);
      return res.status(500).json({
        ok: false,
        error: "admin_cert_upload_failed",
        detail: err.message || String(err),
      });
    }
  }
);


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
        canUpload: !!s.canUpload,
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

// ✅ DELETE /api/admin/users/:id/certificate → eliminar certificado de un usuario
adminRouter.delete("/users/:id/certificate", requireAuth, async (req, res) => {
  try {
    const adminId = req.auth!.userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden" });
    }

    const userId = req.params.id;

    await prisma.userCertificate.deleteMany({ where: { userId } });

    // Limpiar cache de agente mTLS
    clearAgent(`userCert_${userId}`);

    await logAction(
      adminId,
      "DELETE_CERT",
      `Eliminó certificado del usuario ${userId}`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("ADMIN cert delete error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "admin_cert_delete_failed" });
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


adminRouter.get(
  "/users/:userId/file-permissions/:serviceId",
  requireAuth,
  async (req, res) => {
    try {
      const adminId = req.auth!.userId;
      const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
      });

      if (adminUser?.role !== "ADMIN") {
        return res.status(403).json({ error: "forbidden" });
      }

      const { userId, serviceId } = req.params;

      const rules = await prisma.userFilePermission.findMany({
        where: {
          userId,
          serviceId,
        },
        orderBy: { filename: "asc" },
      });

      return res.json({ ok: true, rules });
    } catch (err) {
      console.error("ADMIN file-permissions GET error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "file_permissions_fetch_failed" });
    }
  }
);

/**
 * POST /api/admin/users/:userId/file-permissions/:serviceId
 * Body: { rules: { filename, canView, canDownload }[] }
 * Sobrescribe completamente las reglas para ese user+service.
 */
adminRouter.post(
  "/users/:userId/file-permissions/:serviceId",
  requireAuth,
  async (req, res) => {
    try {
      const adminId = req.auth!.userId;
      const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
      });

      if (adminUser?.role !== "ADMIN") {
        return res.status(403).json({ error: "forbidden" });
      }

      const { userId, serviceId } = req.params;
      const { rules } = req.body as {
        rules: { filename: string; canView: boolean; canDownload: boolean }[];
      };

      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: "invalid_body" });
      }

      // estrategia simple: borrar todas las reglas anteriores y recrear
      await prisma.userFilePermission.deleteMany({
        where: { userId, serviceId },
      });

      if (rules.length > 0) {
        await prisma.userFilePermission.createMany({
          data: rules.map((r) => ({
            userId,
            serviceId,
            filename: r.filename,
            canView: !!r.canView,
            canDownload: !!r.canDownload,
          })),
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("ADMIN file-permissions POST error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "file_permissions_save_failed" });
    }
  }
);


export { adminRouter };
