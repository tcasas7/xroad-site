// src/modules/xroad/router.ts
import { Router } from "express";
import { prisma } from "../../db/prisma";
import axios from "axios";
import { requireAuth } from "../../middlewares/auth";
import { getMtlsAgentForUser } from "../../core/mtls/agentFactory";
import { logAction } from "../logs/logger";

import {
  canViewProvider,
  canViewService,
  canDownloadService,
  canViewFile,
  canDownloadFile
} from "../permissions/permissionService";

const xroadRouter = Router();

/* ==========================================================
 * GET /api/xroad/files
 * ========================================================== */
/*xroadRouter.get("/files", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { providerId, serviceId, endpointPath } = req.query;

    if (!providerId || !serviceId || !endpointPath) {
      return res.status(400).json({ error: "Missing params" });
    }

    if (!(await canViewProvider(userId, String(providerId)))) {
      return res.status(403).json({ error: "forbidden_provider" });
    }

    if (!(await canViewService(userId, String(providerId), String(serviceId)))) {
      return res.status(403).json({ error: "forbidden_service" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.baseUrl) {
      return res.status(400).json({ error: "missing_baseurl" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: String(providerId) },
    });

    const service = await prisma.service.findUnique({
      where: { id: String(serviceId) },
    });

    if (!provider || !service) {
      return res.status(404).json({ error: "not_found" });
    }

    const base = user.baseUrl.replace(/\/+$/, "");
    const cleanEndpoint = String(endpointPath).replace(/^\//, "");

    const listUrl = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      service.serviceCode,
      cleanEndpoint,
    ]
      .filter(Boolean)
      .join("/");

    const consumerHeader =
      `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;

    const httpsAgent = await getMtlsAgentForUser(userId);

    const r = await axios.get(listUrl, {
      httpsAgent,
      headers: {
        "X-Road-Client": consumerHeader,
      },
    });

    let items: string[] = [];
    if (Array.isArray(r.data)) {
      items = r.data.map((e) => e?.filename || e?.name || e);
    }

    await logAction(userId, "VIEW_FILE", `Listó archivos de ${serviceId}`);

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("FILES ERROR =>", err);
    return res.status(502).json({ error: "files_fetch_failed" });
  }
});*/

xroadRouter.get("/files", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { providerId, serviceId, endpointPath, adminMode } = req.query;

    if (!providerId || !serviceId || !endpointPath) {
      return res.status(400).json({ error: "Missing params" });
    }

    const providerIdStr = String(providerId);
    const serviceIdStr = String(serviceId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "no_user" });

    const isAdmin = user.role === "ADMIN";
    const isAdminMode = adminMode === "1"; // 🔥 modo especial para admin-panel

    // permisos base
    if (!(await canViewProvider(userId, providerIdStr))) {
      return res.status(403).json({ error: "forbidden_provider" });
    }

    if (!(await canViewService(userId, providerIdStr, serviceIdStr))) {
      return res.status(403).json({ error: "forbidden_service" });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceIdStr },
    });

    if (!service) {
      return res.status(404).json({ error: "service_not_found" });
    }

    if (!user.baseUrl) {
      return res.status(400).json({ error: "missing_baseurl" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerIdStr },
    });

    if (!provider) {
      return res.status(404).json({ error: "provider_not_found" });
    }

    // Construir URL real de X-Road
    const base = user.baseUrl.replace(/\/+$/, "");
    const cleanEndpoint = String(endpointPath).replace(/^\//, "");

    const listUrl = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      service.serviceCode,
      cleanEndpoint,
    ]
      .filter(Boolean)
      .join("/");

    const httpsAgent = await getMtlsAgentForUser(userId);

    const r = await axios.get(listUrl, {
      httpsAgent,
      headers: {
        "X-Road-Client":
          `${user.xRoadInstance}/${user.xRoadMemberClass}/` +
          `${user.xRoadMemberCode}/${user.xRoadSubsystem}`,
      },
    });

    // Parsear resultado de X-Road
    let items: string[] = [];

    if (Array.isArray(r.data)) {
      items = r.data.map((e) => e?.filename || e?.name || e);
    } else if (typeof r.data === "object" && r.data) {
      const arr = Array.isArray(Object.values(r.data)[0])
        ? (Object.values(r.data)[0] as any[])
        : [];
      items = arr.map((e) => e?.filename || e?.name || e);
    }

    if (!isAdminMode) {
      const fileRules = await prisma.userFilePermission.findMany({
        where: { userId, serviceId: serviceIdStr },
      });

      // Solo activar si existen reglas
      if (fileRules.length > 0) {
        const allowed = new Set(
          fileRules.filter(r => r.canView).map(r => r.filename)
        );

        items = items.filter(name => allowed.has(name));
      }
    }

    return res.json({ ok: true, items });

  } catch (err) {
    console.error("FILES ERROR =>", err);
    return res.status(502).json({ error: "files_fetch_failed" });
  }
});

/* ==========================================================
 * GET /api/xroad/stream
 * ========================================================== */
/*xroadRouter.get("/stream", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;

    const {
      providerId,
      serviceId,
      serviceCode,
      endpointPath,
      filename,
      mode,
    } = req.query;

    if (!providerId || !serviceId || !serviceCode || !endpointPath || !filename) {
      return res.status(400).json({ error: "Missing params" });
    }

    if (!(await canViewProvider(userId, String(providerId)))) {
      return res.status(403).json({ error: "forbidden_provider" });
    }

    if (!(await canViewService(userId, String(providerId), String(serviceId)))) {
      return res.status(403).json({ error: "forbidden_service" });
    }

    if (mode === "download") {
      if (!(await canDownloadService(userId, String(providerId), String(serviceId)))) {
        return res.status(403).json({ error: "forbidden_download" });
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.baseUrl) {
      return res.status(400).json({ error: "missing_baseurl" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: String(providerId) },
    });

    const base = user.baseUrl.replace(/\/+$/, "");
    const cleanEndpoint = String(endpointPath).replace(/^\//, "");

    const finalUrl = [
      base,
      provider!.routeVersion,
      provider!.xRoadInstance,
      provider!.memberClass,
      provider!.memberCode,
      provider!.subsystemCode,
      serviceCode,
      cleanEndpoint,
      encodeURIComponent(String(filename)),
    ]
      .filter(Boolean)
      .join("/");

    const consumerHeader =
      `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;

    const httpsAgent = await getMtlsAgentForUser(userId);

    const response = await axios.get(finalUrl, {
      httpsAgent,
      responseType: "stream",
      headers: { "X-Road-Client": consumerHeader },
    });

    res.setHeader(
      "Content-Disposition",
      `${mode === "preview" ? "inline" : "attachment"}; filename="${filename}"`
    );

    if (response.headers["content-type"]) {
      res.setHeader("Content-Type", response.headers["content-type"]);
    }

    await logAction(
      userId,
      mode === "preview" ? "PREVIEW_FILE" : "DOWNLOAD_FILE",
      `Archivo ${filename}`
    );

    return response.data.pipe(res);
  } catch (err) {
    console.error("STREAM ERROR =>", err);
    return res.status(502).json({ error: "stream_failed" });
  }
});*/

xroadRouter.get("/stream", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;

    const {
      providerId,
      serviceId,
      serviceCode,
      endpointPath,
      filename,
      mode,
    } = req.query;

    if (!providerId || !serviceId || !serviceCode || !endpointPath || !filename) {
      return res.status(400).json({ error: "Missing params" });
    }

    const providerIdStr = String(providerId);
    const serviceIdStr = String(serviceId);
    const serviceCodeStr = String(serviceCode);
    const filenameStr = String(filename);

    /** ----------------------------
     *  PERMISOS BASE
     * ---------------------------- */

    if (!(await canViewProvider(userId, providerIdStr))) {
      return res.status(403).json({ error: "forbidden_provider" });
    }

    if (!(await canViewService(userId, providerIdStr, serviceIdStr))) {
      return res.status(403).json({ error: "forbidden_service" });
    }

    /** ----------------------------
     *  🔒 PERMISOS POR ARCHIVO (VIEW)
     * ---------------------------- */
    if (!(await canViewFile(userId, serviceIdStr, filenameStr))) {
      return res.status(403).json({ error: "forbidden_file" });
    }


    /** ----------------------------
     *  🔒 PERMISOS POR ARCHIVO (DOWNLOAD)
     * ---------------------------- */
    if (mode === "download") {
      const canSvc = await canDownloadService(
        userId,
        providerIdStr,
        serviceIdStr
      );
      const canFile = await canDownloadFile(
        userId,
        serviceIdStr,
        filenameStr
      );

      if (!canSvc || !canFile) {
        return res.status(403).json({ error: "forbidden_download" });
      }
    }

    /** ----------------------------
     *  LLAMADO A X-ROAD
     * ---------------------------- */

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.baseUrl) {
      return res.status(400).json({ error: "missing_baseurl" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerIdStr },
    });

    if (!provider) {
      return res.status(404).json({ error: "provider_not_found" });
    }

    const base = user.baseUrl.replace(/\/+$/, "");
    const cleanEndpoint = String(endpointPath).replace(/^\//, "");

    const finalUrl = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      serviceCodeStr,
      cleanEndpoint,
      encodeURIComponent(filenameStr),
    ]
      .filter(Boolean)
      .join("/");

    const consumerHeader =
      `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;

    const httpsAgent = await getMtlsAgentForUser(userId);

    const response = await axios.get(finalUrl, {
      httpsAgent,
      responseType: "stream",
      headers: { "X-Road-Client": consumerHeader },
    });

    res.setHeader(
      "Content-Disposition",
      `${mode === "preview" ? "inline" : "attachment"}; filename="${filenameStr}"`
    );

    if (response.headers["content-type"]) {
      res.setHeader("Content-Type", response.headers["content-type"]);
    }

    await logAction(
      userId,
      mode === "preview" ? "PREVIEW_FILE" : "DOWNLOAD_FILE",
      `Archivo ${filenameStr}`
    );

    return response.data.pipe(res);

  } catch (err) {
    console.error("STREAM ERROR =>", err);
    return res.status(502).json({ error: "stream_failed" });
  }
});


export { xroadRouter };
