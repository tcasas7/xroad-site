"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Search, Loader2, UploadCloud } from "lucide-react";
import DriveGrid from "../components/DriveGrid";

import {
  getProviderServices,
  getFilesForEndpoint,
  getProviders,
} from "@/lib/api";

import { detectFileType } from "@/lib/drive/utils";

// Tipos
interface ProviderSummary {
  id: string;
  displayName: string;
  services: ServiceSummary[];
}

interface ServicePermissions {
  canView: boolean;
  canDownload: boolean;
  canUpload: boolean;
}

interface ServiceSummary {
  id: string;
  code: string;
  serviceCode?: string;
  endpoints: { path: string }[];
  permissions?: ServicePermissions;
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
  const [fileTypeFilter, setFileTypeFilter] = useState("all");

  const [uploading, setUploading] = useState(false);

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
      const srvList: ServiceSummary[] = svcResp.services ?? [];
      setServices(srvList);

      if (serviceId) {
        const target = srvList.find((s: ServiceSummary) => s.id === serviceId);
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
    const normalized: ServiceSummary = {
      ...svc,
      serviceCode: svc.serviceCode ?? svc.code,
      endpoints: svc.endpoints ?? [],
      permissions: svc.permissions,
    };

    setSelectedService(normalized);
    setFiles([]);
    setLoading(true);

    const endpointPath = normalized.endpoints?.[0]?.path ?? "";

    try {
      const resp = await getFilesForEndpoint(
        providerId!,
        normalized.id,
        endpointPath
      );

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
    }&serviceId=${svc.id}&serviceCode=${
      svc.serviceCode ?? svc.code
    }&endpointPath=${encodeURIComponent(
      svc.endpoints[0].path
    )}&filename=${encodeURIComponent(filename)}&mode=preview`;
  }

  function downloadUrl(svc: ServiceSummary, filename: string) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${
      providerId
    }&serviceId=${svc.id}&serviceCode=${
      svc.serviceCode ?? svc.code
    }&endpointPath=${encodeURIComponent(
      svc.endpoints[0].path
    )}&filename=${encodeURIComponent(filename)}&mode=download`;
  }

  /** SUBIR ARCHIVO */
  async function uploadFile(file: File) {
    if (!selectedService || !providerId) return;
    const endpoint = selectedService.endpoints?.[0]?.path;
    if (!endpoint) {
      alert("Este servicio no tiene endpoint configurado para archivos.");
      return;
    }

    setUploading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL;
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(
        `${apiBase}/api/xroad/upload?providerId=${encodeURIComponent(
          providerId
        )}&serviceId=${encodeURIComponent(
          selectedService.id
        )}&serviceCode=${encodeURIComponent(
          selectedService.serviceCode ?? selectedService.code
        )}&endpointPath=${encodeURIComponent(endpoint)}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!resp.ok) {
        let msg = "Error subiendo archivo.";
        try {
          const err = await resp.json();
          msg += ` (${err.error || ""})`;
        } catch {}
        alert(msg);
        return;
      }

      await selectService(selectedService);
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      alert("Error subiendo archivo.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
    e.target.value = "";
  }

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

  const userCanUpload =
    selectedService?.permissions?.canUpload === true;

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
            <span className="font-medium">
              {selectedService.code || selectedService.serviceCode}
            </span>
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
            {services.map((svc) => {
              const canUpload = svc.permissions?.canUpload === true;
              return (
                <button
                  key={svc.id}
                  onClick={() => selectService(svc)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                    selectedService?.id === svc.id
                      ? "bg-blue-100 text-blue-700"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <span>{svc.code}</span>
                  {canUpload && (
                    <span className="ml-2 inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      <UploadCloud className="w-3 h-3 mr-1" />
                      Sube
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 p-6">
          {/* TOP BAR: Upload + Search + Filter */}
          {selectedService && (
            <div className="flex flex-wrap gap-4 mb-6 items-center">
              {/* Botón subir */}
             {userCanUpload && (
                <>
                  <button
                    onClick={() =>
                      document.getElementById("driveUploadInput")?.click()
                    }
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm shadow-sm disabled:bg-blue-300"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        Subir archivo
                      </>
                    )}
                  </button>

                  <input
                    id="driveUploadInput"
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </>
              )}


              {/* Search */}
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
                <input
                  className="w-full border rounded-lg pl-10 pr-4 py-2 bg-white shadow-sm text-sm"
                  placeholder="Buscar archivos…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Type filter */}
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="border px-3 py-2 rounded-md bg-white text-sm"
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
