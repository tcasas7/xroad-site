// src/modules/providers/router.ts
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import {
  canViewProvider,
  getVisibleProviders,
  getVisibleServices,
} from "../permissions/permissionService";

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

    return res.json({
      ok: true,
      services: services.map((s) => ({
        id: s.id,
        serviceCode: s.serviceCode,
        serviceVersion: s.serviceVersion,
        serviceType: s.serviceType,
        endpoints: s.endpoints.map((e) => ({
          path: e.path,
          method: e.method,
        })),
      })),
    });
  } catch (err) {
    console.error("Services error:", err);
    return res.status(500).json({ ok: false, error: "services_fetch_failed" });
  }
});

export { router };
