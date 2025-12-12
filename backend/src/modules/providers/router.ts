// src/modules/providers/router.ts
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import {
  canViewProvider,
  getVisibleProviders,
  getVisibleServices,
} from "../permissions/permissionService";
import { prisma } from "../../db/prisma";

const router = Router();

/** GET /api/providers */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const providers = await getVisibleProviders(userId);

    // Para el frontend, agregamos "hasServices"
    const result = providers.map((p) => ({
      ...p,
      hasServices: true,
    }));

    return res.json({ ok: true, providers: result });
  } catch (err) {
    console.error("Providers error:", err);
    return res.status(500).json({ ok: false, error: "providers_fetch_failed" });
  }
});

/** GET /api/providers/:id/services */
router.get("/:id/services", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const providerId = String(req.params.id);

    // Validar provider
    const allowed = await canViewProvider(userId, providerId);
    if (!allowed) {
      return res.status(403).json({ error: "forbidden_provider" });
    }

    const services = await getVisibleServices(userId, providerId);
    const serviceIds = services.map((s) => s.id);

    // Traer permisos del usuario para esos servicios (incluye canUpload)
    const perms = await prisma.userServicePermission.findMany({
      where: {
        userId,
        serviceId: { in: serviceIds },
      },
    });

    const permByServiceId = new Map<
      string,
      { canView: boolean; canDownload: boolean; canUpload?: boolean }
    >();

    for (const p of perms) {
      permByServiceId.set(p.serviceId!, {
        canView: p.canView,
        canDownload: p.canDownload,
        // si aún no tenés canUpload en el modelo, ponelo en el schema y migrá
        canUpload: (p as any).canUpload ?? false,
      });
    }

    return res.json({
      ok: true,
      services: services.map((s) => {
        const basePerm = permByServiceId.get(s.id) ?? {
          canView: true,        // ya pasó el filtro de visibles
          canDownload: false,
          canUpload: false,
        };

        return {
          id: s.id,
          code: s.serviceCode,          // para tu front actual
          serviceCode: s.serviceCode,
          serviceVersion: s.serviceVersion,
          serviceType: s.serviceType,
          endpoints: s.endpoints.map((e) => ({
            path: e.path,
            method: e.method,
          })),
          permissions: {
            canView: basePerm.canView,
            canDownload: basePerm.canDownload,
            canUpload: basePerm.canUpload ?? false,
          },
        };
      }),
    });
  } catch (err) {
    console.error("Services error:", err);
    return res.status(500).json({ ok: false, error: "services_fetch_failed" });
  }
});


export { router };
