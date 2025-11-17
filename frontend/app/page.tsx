"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  getProfileXroad,
  getProviders,
  refreshProviders,
  getProviderServices,
  getFilesForEndpoint,
  logout,
} from "@/lib/api";

import { ProviderSummary, ServiceSummary } from "./types/xroad";

import toast from "react-hot-toast";
import Header from "./components/Header";

import {
  Search,
  FolderOpen,
  Eye,
  Download,
  Loader2,
} from "lucide-react";


export default function HomePage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [filteredProviders, setFilteredProviders] = useState<
    ProviderSummary[]
  >([]);

  const [modalProvider, setModalProvider] =
    useState<ProviderSummary | null>(null);

  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [selectedService, setSelectedService] =
    useState<ServiceSummary | null>(null);

  const [files, setFiles] = useState<string[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  /** INIT */
  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfileXroad();

        if (!profile.hasCert) {
          router.push("/setup");
          return;
        }

        setIsAdmin(profile.role === "ADMIN");

      // Cargar proveedores SI EXISTEN, pero...
      let list = [];
      try {
        list = await getProviders();
      } catch {
        list = [];
      }

      // Intentar refrescar solo si corresponde, pero NO obligar
      if (list.length === 0) {
        try {
          await refreshProviders();
          list = await getProviders();
        } catch {
          list = [];
        }
      }

        setProviders(list);
        setFilteredProviders(list);
        setAuthChecked(true);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  /** SEARCH */
  useEffect(() => {
    if (!search.trim()) {
      setFilteredProviders(providers);
      return;
    }

    setFilteredProviders(
      providers.filter((p) =>
        p.displayName.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [search, providers]);

  /** REFRESH */
  async function handleRefresh() {
    try {
      setLoading(true);
      await refreshProviders();
      const list = await getProviders();
      setProviders(list);
      setFilteredProviders(list);
      toast.success("Proveedores actualizados");
    } catch {
      toast.error("Error actualizando proveedores");
    } finally {
      setLoading(false);
    }
  }

  /** OPEN PROVIDER */
  async function openModal(provider: ProviderSummary) {
    setModalProvider(provider);
    setSelectedService(null);
    const resp = await getProviderServices(provider.id);
    setServices(resp.services);
    setFiles(null);
  }

  /** LOAD FILES */
async function handleSelectService(svc: ServiceSummary) {
  const normalized = {
    ...svc,
    serviceCode: svc.serviceCode ?? svc.code, // ← aseguramos serviceCode
  };

  setSelectedService(normalized);
  setFilesLoading(true);

  try {
    const ep = normalized.endpoints[0];
    const { items } = await getFilesForEndpoint(
      modalProvider!.id,
      normalized.id,
      ep.path,
      false // ← usuario normal
    );

    setFiles(items);
  } catch {
    toast.error("Error cargando archivos");
    setFiles([]);
  }

  setFilesLoading(false);
}



  /** STREAM URLS */
function previewUrl(name: string) {
  const ep = selectedService!.endpoints[0];
  return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${
    modalProvider!.id
  }&serviceId=${selectedService!.id}&serviceCode=${
    selectedService!.serviceCode
  }&endpointPath=${encodeURIComponent(ep.path)}&filename=${encodeURIComponent(
    name
  )}&mode=preview`;
}


function downloadUrl(name: string) {
  const ep = selectedService!.endpoints[0];
  return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${
    modalProvider!.id
  }&serviceId=${selectedService!.id}&serviceCode=${
    selectedService!.serviceCode
  }&endpointPath=${encodeURIComponent(ep.path)}&filename=${encodeURIComponent(
    name
  )}&mode=download`;
}



  /** SECURE DOWNLOAD */
  async function secureDownload(url: string, filename: string) {
    try {
      const resp = await fetch(url, { credentials: "include" });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);

        toast.error(
          data?.error === "forbidden_download"
            ? "No tenés permiso para descargar"
            : "Error descargando"
        );
        return;
      }

      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success("Descarga iniciada");
    } catch {
      toast.error("Error descargando archivo");
    }
  }

  if (!authChecked) return <div className="p-6">Verificando…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onRefresh={handleRefresh} />

      {/* BODY */}
      <div className="p-6 max-w-6xl mx-auto">

        {/* SEARCH BAR */}
        <div className="mb-4 flex items-center">
          <div className="relative w-80">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <input
              className="w-full border rounded-lg pl-8 pr-3 py-2 bg-white shadow-sm"
              placeholder="Buscar proveedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* TABLE */}
        <div className="rounded-lg border shadow-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">Proveedores</th>
                <th className="p-3 text-left">Servicios</th>
                <th className="p-3 text-left">Acción</th>
              </tr>
            </thead>

            <tbody>
              {filteredProviders.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{p.displayName}</td>
                  <td className="p-3">
                    {p.hasServices ? "Sí" : "No"}
                  </td>
                  <td className="p-3">
                    <button
                      disabled={!p.hasServices}
                      onClick={() => openModal(p)}
                      className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 text-sm flex items-center gap-1"
                    >
                      <FolderOpen size={14} />
                      Ver servicios
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MODAL */}
        {modalProvider && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-xl w-full shadow-xl">

              {/* HEADER */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  Servicios — {modalProvider.displayName}
                </h2>
                <button onClick={() => setModalProvider(null)}>✕</button>
              </div>

              {/* LISTA DE SERVICIOS */}
              {!selectedService && services && (
                <div className="space-y-3 max-h-[60vh] overflow-auto">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="border rounded-lg p-4 shadow-sm bg-white flex justify-between items-center"
                    >
                      <div>
                        <div className="font-bold">{svc.code}</div>
                        <div className="text-xs text-gray-500">
                          {svc.type}
                        </div>
                      </div>

                      <button
                        onClick={() => handleSelectService(svc)}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                      >
                        Ver archivos
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* LISTA DE ARCHIVOS */}
              {selectedService && (
                <>
                  <button
                    onClick={() => {
                      setSelectedService(null);
                      setFiles(null);
                    }}
                    className="text-blue-600 underline text-sm mb-3"
                  >
                    ← Volver
                  </button>

                  {filesLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="animate-spin" size={28} />
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[60vh] overflow-auto">
                      {files?.length === 0 && <p>No hay archivos.</p>}

                      {files?.map((f) => (
                        <div
                          key={f}
                          className="border rounded-lg p-4 shadow-sm flex justify-between items-center"
                        >
                          <span>{f}</span>

                          <div className="flex gap-2">
                            <a
                              href={previewUrl(f)}
                              target="_blank"
                              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm flex items-center gap-1"
                            >
                              <Eye size={14} /> Ver
                            </a>

                            <button
                              onClick={() => secureDownload(downloadUrl(f), f)}
                              className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-sm flex items-center gap-1"
                            >
                              <Download size={14} /> Descargar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
