"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  getProfileXroad,
  getProviders,
  refreshProviders,
  getProviderServices,
  getFilesForEndpoint,
  getUserFilePermissions,
  getUserPermissions,
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
import DriveGrid from "./components/DriveGrid";


type SearchEntry = {
  type: "provider" | "service" | "file";
  providerId: string;
  providerName: string;
  serviceId?: string;
  serviceCode?: string;
  fileName?: string;
};


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

  const [deepSearch, setDeepSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchEntry[]>([]);

  

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

   const index: SearchEntry[] = [];

    for (const prov of list) {
     
      index.push({
        type: "provider",
        providerId: prov.id,
        providerName: prov.displayName,
      });

     
      const svcResp = await getProviderServices(prov.id);

      for (const svc of svcResp.services ?? []) {
        index.push({
          type: "service",
          providerId: prov.id,
          providerName: prov.displayName,
          serviceId: svc.id,
          serviceCode: svc.code,
        });

        // Cargar archivos del endpoint
        const ep = svc.endpoints?.[0];
        if (!ep) continue;

        try {
          const filesResp = await getFilesForEndpoint(prov.id, svc.id, ep.path);
          for (const file of filesResp.items ?? []) {
            index.push({
              type: "file",
              providerId: prov.id,
              providerName: prov.displayName,
              serviceId: svc.id,
              serviceCode: svc.code,
              fileName: file,
            });
          }
        } catch {}
      }
    }

    setSearchIndex(index);

        setAuthChecked(true);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  /** GLOBAL SEARCH */
useEffect(() => {
  const q = globalSearch.trim().toLowerCase();

  if (!q) {
    setSearchResults([]);
    return;
  }

  setSearchResults(
    searchIndex.filter(
      (e) =>
        e.providerName.toLowerCase().includes(q) ||
        e.serviceCode?.toLowerCase().includes(q) ||
        e.fileName?.toLowerCase().includes(q)
    )
  );
}, [globalSearch, searchIndex]);



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

  function handleSearchClick(entry: SearchEntry) {
  if (entry.type === "provider") {
    router.push(`/drive?providerId=${entry.providerId}`);
    return;
  }

  if (entry.type === "service") {
    router.push(
      `/drive?providerId=${entry.providerId}&serviceId=${entry.serviceId}`
    );
    return;
  }

  if (entry.type === "file") {
    router.push(
      `/drive?providerId=${entry.providerId}&serviceId=${entry.serviceId}&file=${encodeURIComponent(
        entry.fileName!
      )}`
    );
    return;
  }
}

  if (!authChecked) return <div className="p-6">Verificando…</div>;

return (
  <div className="min-h-screen bg-gray-50">
    <Header onRefresh={handleRefresh} />

    <div className="p-6 max-w-6xl mx-auto">

      {/* 🔍 BUSCADOR GLOBAL */}
      <div className="mb-6 max-w-3xl mx-auto relative">

        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-500" />

          <input
            className="w-full border rounded-full pl-10 pr-12 py-3 bg-white shadow-sm text-sm"
            placeholder="Buscar proveedor, servicio o archivo…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />

          {globalSearch && (
            <button
              className="absolute right-3 top-3 text-gray-500 hover:text-black"
              onClick={() => setGlobalSearch("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* PANEL DE RESULTADOS */}
        {globalSearch && (
          <div className="absolute mt-2 w-full bg-white border rounded-xl shadow-xl max-h-[60vh] overflow-auto z-50">

            {/* Filtros fake estilo Drive */}
            <div className="flex gap-2 p-3 border-b bg-gray-50 text-xs text-gray-700">
              <button className="px-3 py-1 border rounded-full hover:bg-gray-100">
                Tipo
              </button>
              <button className="px-3 py-1 border rounded-full hover:bg-gray-100">
                Persona
              </button>
              <button className="px-3 py-1 border rounded-full hover:bg-gray-100">
                Modificado
              </button>
            </div>

            {/* RESULTADOS */}
            <div>
              {searchResults.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Sin resultados…</p>
              ) : (
                searchResults.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => handleSearchClick(r)}
                    className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                  >
                    <div className="flex flex-col">

                      <span className="font-medium">
                        {r.fileName || r.serviceCode || r.providerName}
                      </span>

                      <span className="text-xs text-gray-500">
                        {r.type === "file" &&
                          `Archivo · ${r.providerName} / ${r.serviceCode}`}
                        {r.type === "service" &&
                          `Servicio · ${r.providerName}`}
                        {r.type === "provider" &&
                          `Proveedor`}
                      </span>
                    </div>

                    <span className="text-xs text-gray-400">hoy</span>
                  </div>
                ))
              )}
            </div>

          </div>
        )}
      </div>

      {/* =========================== */}
      {/* 📁 GRID DE PROVEEDORES      */}
      {/* =========================== */}
      <DriveGrid
        items={providers.map((p) => ({
          id: p.id,
          name: p.displayName,
          type: "folder",
        }))}
        onOpen={(prov) => router.push(`/drive?providerId=${prov.id}`)}
      />

    </div>
  </div>
);

}
