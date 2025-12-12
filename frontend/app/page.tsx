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
  getMe,
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
import { detectChanges } from "@/lib/changes";


type SearchEntry = {
  type: "provider" | "service" | "file";
  providerId: string;
  providerName: string;
  serviceId?: string;
  serviceCode?: string;
  fileName?: string;
};

type ChangeSnapshot = {
  newProviders: string[];
  newServices: { providerId: string; serviceId: string }[];
  newFiles: { providerId: string; serviceId: string; file: string }[];
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
  const [changes, setChanges] = useState<ChangeSnapshot | null>(null);
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const [nameMaps, setNameMaps] = useState<{
  providerNames: Record<string, string>,
  serviceNames: Record<string, string>
} | null>(null);

  const [uploadableServices, setUploadableServices] = useState<
    { providerId: string; providerName: string; serviceId: string; serviceCode: string }[]
  >([]);


/** INIT */
useEffect(() => {
  (async () => {
    try {
      // 1️⃣ Obtener ID real del usuario
      const me = await getMe();
      if (!me?.user?.id) {
        console.error("No user ID found");
        router.push("/login");
        return;
      }

      const userId = me.user.id;
      console.log("REAL USER ID:", userId);

      // 2️⃣ Obtener profile de X-Road
      const profile = await getProfileXroad();

      if (!profile.hasCert) {
        router.push("/setup");
        return;
      }

      setIsAdmin(profile.userRole === "ADMIN");
      setProfile(profile);

      // 3️⃣ Inicializar snapshot por usuario (si no existe)
      const key = `snapshot_xroad_${userId}`;
      const previousSnapshot = JSON.parse(
        localStorage.getItem(key) ||
        JSON.stringify({ providers: [], services: {}, files: {} })
      );

      // 4️⃣ Continuamos tu lógica normal ↓↓↓
      let list: ProviderSummary[] = [];
      try {
        list = await getProviders();
      } catch {
        list = [];
      }

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

      // SNAPSHOT ACTUAL
      const index: SearchEntry[] = [];
      const snapshotCurrent = {
        providers: list.map((p) => p.id),
        services: {} as Record<string, string[]>,
        files: {} as Record<string, string[]>,
      };

      const uploadables: {
        providerId: string;
        providerName: string;
        serviceId: string;
        serviceCode: string;
      }[] = [];

      for (const prov of list) {
        index.push({
          type: "provider",
          providerId: prov.id,
          providerName: prov.displayName,
        });

        const svcResp = await getProviderServices(prov.id);
        const services: ServiceSummary[] = svcResp.services ?? [];
        snapshotCurrent.services[prov.id] = services.map((s) => s.id);

        for (const svc of services) {
          index.push({
            type: "service",
            providerId: prov.id,
            providerName: prov.displayName,
            serviceId: svc.id,
            serviceCode: svc.code,
          });

          if (svc.permissions?.canUpload) {
            uploadables.push({
              providerId: prov.id,
              providerName: prov.displayName,
              serviceId: svc.id,
              serviceCode: svc.code,
            });
          }

          const ep = svc.endpoints?.[0];
          if (!ep) continue;

          try {
            const filesResp = await getFilesForEndpoint(prov.id, svc.id, ep.path);
            const fileList = filesResp.items ?? [];

            snapshotCurrent.files[`${prov.id}::${svc.id}`] = fileList;

            for (const f of fileList) {
              index.push({
                type: "file",
                providerId: prov.id,
                providerName: prov.displayName,
                serviceId: svc.id,
                serviceCode: svc.code,
                fileName: f,
              });
            }
          } catch {
            snapshotCurrent.files[`${prov.id}::${svc.id}`] = [];
          }
        }
      }

      const providerNames: Record<string, string> = {};
      const serviceNames: Record<string, string> = {};

      for (const prov of list) {
        providerNames[prov.id] = prov.displayName;

        const svcResp = await getProviderServices(prov.id);
        const services: ServiceSummary[] = svcResp.services ?? [];

        for (const svc of services) {
          serviceNames[svc.id] = svc.code;
        }
      }

      // Guardamos los mapas en estado para usarlos al renderizar modal
      setNameMaps({
        providerNames,
        serviceNames,
      });

      setUploadableServices(uploadables);

      setSearchIndex(index);

      // 5️⃣ Detectar cambios usando snapshot previo REAL del usuario
      const updates = detectChanges(snapshotCurrent, previousSnapshot);
      setChanges(updates);

      // 6️⃣ Guardar nuevo snapshot por usuario
      localStorage.setItem(
        key,
        JSON.stringify(snapshotCurrent)
      );

      setAuthChecked(true);
    } catch (err) {
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

const [recentFiles, setRecentFiles] = useState<any[]>([]);

useEffect(() => {
  const raw = localStorage.getItem("recent_files");
  if (!raw) return;

  try {
    const list = JSON.parse(raw);

    // orden descendente por fecha
    list.sort((a: any, b: any) => b.accessedAt - a.accessedAt);

    setRecentFiles(list);
  } catch {}
}, []);

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < min) return "ahora";
  if (diff < hour) return `${Math.floor(diff / min)} min atrás`;
  if (diff < day) return `${Math.floor(diff / hour)} hor atrás`;
  return `${Math.floor(diff / day)} días atrás`;
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

      {recentFiles.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Recientes</h2>

          <div className="bg-white border rounded-xl shadow p-4">
            {recentFiles.map((r, i) => (
              <div
                key={i}
                onClick={() =>
                  router.push(
                    `/drive?providerId=${r.providerId}&serviceId=${r.serviceId}&file=${encodeURIComponent(
                      r.name
                    )}`
                  )
                }
                className="flex items-center justify-between px-2 py-2 hover:bg-gray-50 cursor-pointer rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {/* icono según extensión */}
                  <span className="text-blue-600 text-xl">
                    {r.name.endsWith(".pdf") && "📄"}
                    {r.name.endsWith(".txt") && "📄"}
                    {r.name.endsWith(".zip") && "🗜️"}
                    {r.name.endsWith(".csv") && "📊"}
                    {r.name.endsWith(".jpg") && "🖼️"}
                    {r.name.endsWith(".png") && "🖼️"}
                    {r.name.endsWith(".mp4") && "🎥"}
                    {!r.name.includes(".") && "📁"}
                  </span>

                  <div className="flex flex-col">
                    <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-gray-500">
                    {nameMaps?.providerNames?.[r.providerId] ?? r.providerId} /{" "}
                    {nameMaps?.serviceNames?.[r.serviceId] ?? r.serviceId}
                  </span>
                  </div>
                </div>

                <span className="text-xs text-gray-400">
                  {timeAgo(r.accessedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Servicios donde el usuario puede subir archivos */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Servicios donde podés subir archivos
        </h2>

        {uploadableServices.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no tenés servicios con permiso para subir archivos.
          </p>
        ) : (
          <div className="bg-white border rounded-xl shadow divide-y">
            {uploadableServices.map((s, idx) => (
              <button
                key={`${s.providerId}-${s.serviceId}-${idx}`}
                onClick={() =>
                  router.push(
                    `/drive?providerId=${s.providerId}&serviceId=${s.serviceId}`
                  )
                }
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-gray-800">
                    {s.serviceCode}
                  </span>
                  <span className="text-xs text-gray-500">
                    {nameMaps?.providerNames?.[s.providerId] ?? s.providerName}
                  </span>
                </div>
                <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Subir archivo
                </span>
              </button>
            ))}
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
{changes &&
  (
    changes.newProviders?.length > 0 ||
    changes.newServices?.length > 0 ||
    changes.newFiles?.length > 0
  ) && (
    <button
      onClick={() => setShowChangesModal(true)}
      className="fixed bottom-6 right-6 bg-blue-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-700 transition"
    >
      🔔 Tienes novedades
    </button>
  )
}

{showChangesModal && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
      <h2 className="text-xl font-semibold mb-4">Novedades en X-Road</h2>

      {/* NUEVOS PROVEEDORES */}
      {changes?.newProviders?.map((p) => (
        <div key={p} className="py-1">
          📁 Nuevo proveedor: <b>{nameMaps?.providerNames[p] ?? p}</b>
        </div>
      ))}

      {/* NUEVOS SERVICIOS */}
      {changes?.newServices?.map((s) => (
        <div key={s.providerId + s.serviceId} className="py-1">
          🔧 Nuevo servicio:{" "}
          <b>{nameMaps?.serviceNames[s.serviceId] ?? s.serviceId}</b>{" "}
          en{" "}
          {nameMaps?.providerNames[s.providerId] ??
            s.providerId}
        </div>
      ))}

      {/* NUEVOS ARCHIVOS */}
      {changes?.newFiles?.map((f) => (
        <div key={f.providerId + f.serviceId + f.file} className="py-1">
          📄 Nuevo archivo: <b>{f.file}</b>{" "}
          ({nameMaps?.serviceNames[f.serviceId] ?? f.serviceId})
        </div>
      ))}

      <button
        onClick={() => setShowChangesModal(false)}
        className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
      >
        Cerrar
      </button>
    </div>
  </div>
)}



    </div>
  </div>
);

}
