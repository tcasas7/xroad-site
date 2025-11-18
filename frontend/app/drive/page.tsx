"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Search, Loader2 } from "lucide-react";
import DriveGrid from "../components/DriveGrid";

import {
  getProviderServices,
  getFilesForEndpoint,
  getProviders,
} from "@/lib/api";

interface ProviderSummary {
  id: string;
  displayName: string;
  services: ServiceSummary[];
}

interface ServiceSummary {
  id: string;
  code: string;
  serviceCode?: string;
  endpoints: { path: string }[];
}

export default function DrivePage() {
  const router = useRouter();
  const params = useSearchParams();

  const providerId = params.get("providerId");
  const serviceId = params.get("serviceId") || null;
  const fileFromSearch = params.get("file") || null;

  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(null);

  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  /** INIT PROVIDER */
  useEffect(() => {
    (async () => {
      if (!providerId) {
        router.push("/");
        return;
      }

      setLoading(true);

      const providers = await getProviders();
      const prov = providers.find((p: ProviderSummary) => p.id === providerId);


      if (!prov) {
        router.push("/");
        return;
      }

      setProvider(prov);

      // Load services
      const svcResp = await getProviderServices(providerId);
      setServices(svcResp.services);

      // If coming from global search
      if (serviceId) {
        const target = svcResp.services.find((s: ServiceSummary) => s.id === serviceId);
        if (target) selectService(target, fileFromSearch || null);
      }

      setLoading(false);
    })();
  }, [providerId, serviceId]);

  /** SELECT SERVICE */
  async function selectService(svc: ServiceSummary, autoOpenFile: string | null = null) {
    const normalized = {
      ...svc,
      serviceCode: svc.serviceCode ?? svc.code,
      endpointPath: svc.endpoints?.[0]?.path ?? "",
    };

    setSelectedService(normalized);
    setFiles([]);
    setLoading(true);

    try {
      const resp = await getFilesForEndpoint(
        providerId!,
        normalized.id,
        normalized.endpointPath
      );
      setFiles(resp.items || []);

      // If global search selected a file → open it right away
      if (autoOpenFile) {
        const url = previewUrl(normalized, autoOpenFile);
        window.open(url, "_blank");
      }

    } catch {
      setFiles([]);
    }

    setLoading(false);
  }

  /** STREAM URLS */
  function previewUrl(svc: ServiceSummary, filename: string) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${
      providerId
    }&serviceId=${svc.id}&serviceCode=${svc.serviceCode}&endpointPath=${encodeURIComponent(
      svc.endpoints[0].path
    )}&filename=${encodeURIComponent(filename)}&mode=preview`;
  }

  function downloadUrl(svc: ServiceSummary, filename: string) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${
      providerId
    }&serviceId=${svc.id}&serviceCode=${svc.serviceCode}&endpointPath=${encodeURIComponent(
      svc.endpoints[0].path
    )}&filename=${encodeURIComponent(filename)}&mode=download`;
  }

  /** FILE FILTER */
  const filteredFiles = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ===== BREADCRUMB ===== */}
      <div className="border-b bg-white py-3 px-6 flex items-center gap-2 text-gray-700 text-sm">
        <button className="text-blue-600" onClick={() => router.push("/")}>
          Mi unidad
        </button>
        <span>/</span>
        {provider && <span className="font-medium">{provider.displayName}</span>}
        {selectedService && (
          <>
            <span>/</span>
            <span className="font-medium">{selectedService.code}</span>
          </>
        )}
      </div>

      {/* ===== DRIVE LAYOUT ===== */}
      <div className="flex flex-1">

        {/* SIDEBAR */}
        <aside className="w-64 border-r bg-white p-4 hidden md:block">
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">
            Servicios
          </h2>

          <div className="space-y-1">
            {services.map((svc) => (
              <button
                key={svc.id}
                onClick={() => selectService(svc)}
                className={`
                  w-full text-left px-3 py-2 rounded-md text-sm
                  ${
                    selectedService?.id === svc.id
                      ? "bg-blue-100 text-blue-700"
                      : "hover:bg-gray-100"
                  }
                `}
              >
                {svc.code}
              </button>
            ))}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 p-6">

          {/* SEARCH INSIDE SERVICE */}
          {selectedService && (
            <div className="relative mb-6 max-w-md">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
              <input
                className="w-full border rounded-lg pl-10 pr-4 py-2 bg-white shadow-sm"
                placeholder="Buscar archivos dentro del servicio…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin" size={32} />
            </div>
          )}

          {/* SERVICE LIST */}
          {!loading && !selectedService && (
            <DriveGrid
              items={services.map((s) => ({
                id: s.id,
                name: s.code,
                type: "folder",
              }))}
              onOpen={(item) =>
                selectService(services.find((s) => s.id === item.id)!)
              }
            />
          )}

          {/* FILE LIST */}
          {!loading && selectedService && (
            <DriveGrid
              items={filteredFiles.map((f) => ({
                id: f,
                name: f,
                type: "file",
              }))}
              onOpen={(file) =>
                window.open(
                  previewUrl(selectedService, file.name),
                  "_blank"
                )
              }
              onPreview={(file) =>
                window.open(
                  previewUrl(selectedService, file.name),
                  "_blank"
                )
              }
              onDownload={(file) =>
                window.open(
                  downloadUrl(selectedService, file.name),
                  "_blank"
                )
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
