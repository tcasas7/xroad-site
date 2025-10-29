import { Router } from "express";
import axios from "axios";
import { prisma } from "../../db/prisma";
import { getMtlsAgent } from "../../core/mtls/agentFactory";

const router = Router();

function sanitizeBaseUrl(u: string) {
  return (u || "").trim().replace(/\/+$/, "");
}
function ensureLeadingSlash(p: string) {
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}
function buildConsumerHeader(ten: {
  xRoadInstance: string;
  xRoadMemberClass: string;
  xRoadMemberCode: string;
  xRoadSubsystem: string;
}) {
  return `${ten.xRoadInstance}/${ten.xRoadMemberClass}/${ten.xRoadMemberCode}/${ten.xRoadSubsystem}`;
}

type InvokeBody = {
  providerId: string;          // id de Provider (DB)
  serviceCode: string;         // p.ej "PROV10"
  path: string;                // p.ej "/api/files" (sin wildcard)
  method?: string;             // GET/POST/...
  query?: Record<string, any>; // se anexa como querystring
  payload?: any;               // body para POST/PUT
  headers?: Record<string, string>; // extra headers a propagar (opc)
  stream?: boolean;            // si true, forzar modo stream
};

/**
 * POST /api/invoke
 * - Si Content-Type esperado es binario o viene ?view=1 / body.stream → responde en streaming.
 * - Si es JSON → devuelve JSON.
 *
 * Body JSON: { providerId, serviceCode, path, method?, query?, payload?, headers?, stream? }
 * Querystring: ?view=1   → Content-Disposition: inline
 */
router.post("/", async (req, res) => {
  try {
    const {
      providerId,
      serviceCode,
      path,
      method: _method,
      query,
      payload,
      headers: extraHeaders,
      stream: forceStream,
    } = (req.body || {}) as InvokeBody;

    if (!providerId || !serviceCode || !path) {
      return res.status(400).json({ error: "missing_params" });
    }

    const [tenant, provider] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { id: "singleton" } }),
      prisma.provider.findUnique({ where: { id: providerId } }),
    ]);

    if (!tenant) return res.status(400).json({ error: "tenant_not_configured" });
    if (!provider) return res.status(404).json({ error: "provider_not_found" });

    const baseUrl = sanitizeBaseUrl(tenant.baseUrl);
    const consumerHeader = buildConsumerHeader(tenant);

    const finalUrl =
      `${baseUrl}` +
      `/${provider.routeVersion || ""}`.replace(/\/$/, "") +
      `/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}` +
      `/${serviceCode}` +
      `${ensureLeadingSlash(String(path))}`;

    const httpsAgent = await getMtlsAgent();

    // Armamos headers: siempre X-Road-Client + Accept razonable
    const headers: Record<string, string> = {
      "X-Road-Client": consumerHeader,
      Accept: extraHeaders?.Accept || "*/*",
      ...(extraHeaders || {}),
    };

    const method = String(_method || "GET").toUpperCase();

    // ¿El cliente pide streaming?
    const viewInline = String(req.query.view || "").trim() === "1";
    const shouldStream = Boolean(forceStream || viewInline);

    if (shouldStream) {
      // STREAMING (para PDF/imagen/binario), con inline/attachment
      const r = await axios.request({
        url: finalUrl,
        method,
        params: query,
        data: payload,
        headers,
        httpsAgent,
        // Clave: stream
        responseType: "stream",
        // X-Road suele ser estricto: no sigas redirects inesperados
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 500,
      });

      // Si viene error del otro lado, propagamos el JSON o texto
      if (r.status < 200 || r.status >= 300) {
        let body: any = r.data;
        if (body && typeof (body as any).pipe === "function") {
          // si por error vino stream, convertimos a texto corto
          return res.status(502).json({ error: "upstream_stream_error" });
        }
        return res.status(r.status).json({ error: "upstream_error", detail: body });
      }

      // Propagamos content-type si existe
      const ct = r.headers["content-type"] || "application/octet-stream";
      res.setHeader("Content-Type", ct);

      // Inline vs attachment
      const dispo = viewInline ? "inline" : "attachment";
      // Nombre best-effort
      const filename =
        extraHeaders?.["X-Filename"] ||
        (r.headers["content-disposition"]?.match(/filename="?(.*?)"?$/)?.[1] ?? "resource");
      res.setHeader("Content-Disposition", `${dispo}; filename="${filename}"`);

      // Pipe al cliente
      r.data.pipe(res);
      return;
    }

    // MODO JSON (no-stream)
    const r = await axios.request({
      url: finalUrl,
      method,
      params: query,
      data: payload,
      headers,
      httpsAgent,
      responseType: "json",
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 500,
    });

    if (r.status < 200 || r.status >= 300) {
      return res.status(r.status).json({
        error: "upstream_error",
        detail: typeof r.data === "string" ? r.data : r.data,
      });
    }

    // Si por alguna razón devolvió binario en no-stream, lo avisamos
    const ct = String(r.headers["content-type"] || "").toLowerCase();
    if (ct && !ct.includes("json")) {
      return res.status(415).json({
        error: "not_json",
        hint: "Usá stream con ?view=1 para previsualizar o sin view para descargar.",
        contentType: ct,
      });
    }

    res.json(r.data);
  } catch (err: any) {
    console.error("invoke_error =>", err?.response?.status, err?.response?.data || err?.message);
    const status = err?.response?.status || 500;
    const detail = err?.response?.data || err?.message || String(err);
    res.status(status).json({ error: "invoke_failed", detail });
  }
});

export { router };
