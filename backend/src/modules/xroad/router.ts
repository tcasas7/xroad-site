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
} from "../permissions/permissionService";

const xroadRouter = Router();

/* ==========================================================
 * GET /api/xroad/files
 * ========================================================== */
xroadRouter.get("/files", requireAuth, async (req, res) => {
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
});

/* ==========================================================
 * GET /api/xroad/stream
 * ========================================================== */
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
});

export { xroadRouter };
