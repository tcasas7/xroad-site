// src/modules/xroad/router.ts
import { Router } from "express";
import { prisma } from "../../db/prisma";
import { getMtlsAgent } from "../../core/mtls/agentFactory";
import axios from "axios";

const xroadRouter = Router();

/**
 * GET /api/xroad/files
 * Query:
 *   providerId
 *   serviceCode
 *   endpointPath
 */
xroadRouter.get("/files", async (req, res) => {
  try {
    const { providerId, serviceCode, endpointPath } = req.query;
    if (!providerId || !serviceCode || !endpointPath) {
      return res.status(400).json({ error: "Missing query params" });
    }

    const provider = await prisma.provider.findUnique({ where: { id: String(providerId) } });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const tenant = await prisma.tenantSettings.findUnique({ where: { id: "singleton" } });
    if (!tenant) return res.status(500).json({ error: "Tenant not configured" });

    const consumerHeader = `${tenant.xRoadInstance}/${tenant.xRoadMemberClass}/${tenant.xRoadMemberCode}/${tenant.xRoadSubsystem}`;

    const base = tenant.baseUrl.replace(/\/+$/, "");
    const url = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      serviceCode,
      endpointPath
    ]
      .filter(Boolean)
      .join("/")
      .replace(/\/{2,}/g, "/")
      .replace(":/", "://");

    const httpsAgent = await getMtlsAgent();
    const r = await axios.get(url, {
      httpsAgent,
      headers: { "X-Road-Client": consumerHeader },
    });

    const data = r.data;
    let items: string[] = [];
    if (Array.isArray(data)) {
      items = data.map(d =>
        typeof d === "string" ? d : d?.filename || d?.name || d?.path || JSON.stringify(d)
      );
    } else if (data && typeof data === "object") {
      const vals = Object.values(data);
      if (Array.isArray(vals[0])) {
        items = (vals[0] as any[]).map(d =>
          typeof d === "string" ? d : d?.filename || d?.name || d?.path || JSON.stringify(d)
        );
      }
    }

    return res.json({ ok: true, items });
  } catch (err: any) {
    console.error("FILES ERROR =>", err?.message || err);
    return res.status(502).json({
      error: "files_fetch_failed",
      detail: err?.response?.data || err?.message || String(err),
    });
  }
});

/**
 * GET /api/xroad/stream
 * Query:
 *   providerId
 *   serviceCode
 *   endpointPath
 *   filename
 *   mode=preview|download
 */
xroadRouter.get("/stream", async (req, res) => {
  try {
    const { providerId, serviceCode, endpointPath, filename, mode } = req.query;
    if (!providerId || !serviceCode || !endpointPath || !filename) {
      return res.status(400).json({ error: "Missing params" });
    }

    const provider = await prisma.provider.findUnique({ where: { id: String(providerId) } });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const tenant = await prisma.tenantSettings.findUnique({ where: { id: "singleton" }});
    if (!tenant) return res.status(500).json({ error: "Tenant not configured" });

    const consumerHeader = `${tenant.xRoadInstance}/${tenant.xRoadMemberClass}/${tenant.xRoadMemberCode}/${tenant.xRoadSubsystem}`;

    const base = tenant.baseUrl.replace(/\/+$/, "");
    const listBase = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      serviceCode,
      endpointPath,
    ]
      .filter(Boolean)
      .join("/")
      .replace(/\/{2,}/g, "/")
      .replace(":/", "://")
      .replace(/\/$/, "");

    const finalUrl = `${listBase}/${encodeURIComponent(String(filename))}`;

    const httpsAgent = await getMtlsAgent();
    const response = await axios.get(finalUrl, {
      httpsAgent,
      responseType: "stream",
      headers: { "X-Road-Client": consumerHeader },
    });

    const dispo = mode === "preview" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${dispo}; filename="${filename}"`);

    if (response.headers["content-type"]) {
      res.setHeader("Content-Type", response.headers["content-type"]);
    }

    return response.data.pipe(res);
  } catch (err: any) {
    console.error("STREAM ERROR =>", err?.message || err);
    return res.status(502).json({
      error: "stream_failed",
      detail: err?.response?.data || err?.message || String(err),
    });
  }
});

export { xroadRouter };
