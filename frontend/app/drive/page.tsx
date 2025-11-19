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

import { detectFileType } from "@/lib/drive/utils"; // ⬅ NUEVO

// Tipos
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

interface FileEntry {
  id: string;
  name: string;
  type: "file";
  fileType: string;
}

export default function DrivePage() {
  const router = useRouter();
  const params = useSearchParams();

  const providerId = params.get("providerId");
  const serviceId = params.get("serviceId") || null;
  const fileFromSearch = params.get("file") || null;

  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedService, setSelectedService] =
    useState<ServiceSummary | null>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all"); // ⬅ NUEVO

  /** INIT PROVIDER */
  useEffect(() => {
    (async () => {
      if (!providerId) return router.push("/");

      setLoading(true);

      const providers = await getProviders();
      const prov = providers.find((p: ProviderSummary) => p.id === providerId);

      if (!prov) return router.push("/");

      setProvider(prov);

      const svcResp = await getProviderServices(providerId);
      setServices(svcResp.services);

      if (serviceId) {
        const target = svcResp.services.find((s: ServiceSummary) => s.id === serviceId);
        if (target) selectService(target, fileFromSearch);
      }

      setLoading(false);
    })();
  }, [providerId, serviceId]);

  /** SELECT SERVICE */
  async function selectService(
    svc: ServiceSummary,
    autoOpenFile: string | null = null
  ) {
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

      // build file entries (with type)
      const fileEntries: FileEntry[] = (resp.items || []).map((f: string) => ({
        id: f,
        name: f,
        type: "file",
        fileType: detectFileType(f),
      }));


      setFiles(fileEntries);

      if (autoOpenFile) {
        registerRecent(autoOpenFile, providerId!, normalized.id);
        window.open(previewUrl(normalized, autoOpenFile), "_blank");
      }
    } catch {
      setFiles([]);
    }

    setLoading(false);
  }

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


  /** REGISTER RECENT FILES */
  function registerRecent(name: string, providerId: string, serviceId: string) {
    try {
      const raw = localStorage.getItem("recent_files");
      const list = raw ? JSON.parse(raw) : [];

      const entry = {
        name,
        providerId,
        serviceId,
        accessedAt: Date.now(),
      };

      const newList = [
        entry,
        ...list.filter((x: any) => x.name !== name || x.serviceId !== serviceId),
      ].slice(0, 3); 

      localStorage.setItem("recent_files", JSON.stringify(newList));
    } catch (e) {
      console.error("failed to register recent", e);
    }
  }


  /** FILTER FILES */
  const filteredFiles = files
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .filter((f) => fileTypeFilter === "all" || f.fileType === fileTypeFilter);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* BREADCRUMB */}
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
                className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                  selectedService?.id === svc.id
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-gray-100"
                }`}
              >
                {svc.code}
              </button>
            ))}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 p-6">

          {/* FILE SEARCH + TYPE FILTER */}
          {selectedService && (
            <div className="flex gap-4 mb-6">

              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  className="w-full border rounded-lg pl-10 pr-4 py-2 bg-white shadow-sm"
                  placeholder="Buscar archivos…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Type filter */}
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white"
              >
                <option value="all">Todos</option>
                <option value="pdf">PDFs</option>
                <option value="document">Documentos</option>
                <option value="spreadsheet">Hojas de cálculo</option>
                <option value="presentation">Presentaciones</option>
                <option value="image">Imágenes</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="archive">ZIP / RAR</option>
                <option value="text">Text / TXT</option>
                <option value="other">Otros</option>
              </select>
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
              items={filteredFiles}
              onOpen={(file) => {
                registerRecent(file.name, providerId!, selectedService.id);
                window.open(previewUrl(selectedService, file.name), "_blank");
              }}
              onPreview={(file) => {
                registerRecent(file.name, providerId!, selectedService.id);
                window.open(previewUrl(selectedService, file.name), "_blank");
              }}
              onDownload={(file) =>
                window.open(downloadUrl(selectedService, file.name), "_blank")
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
