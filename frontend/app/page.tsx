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

export default function HomePage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [modalProvider, setModalProvider] = useState<ProviderSummary | null>(null);
  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(null);
  const [files, setFiles] = useState<string[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

useEffect(() => {
  (async () => {
    try {
      const profile = await getProfileXroad();

      // Si el backend responde con perfil incompleto, redirigir
      if (
        !profile.ok &&
        !(
          profile.baseUrl &&
          profile.xroad?.instance &&
          profile.xroad?.memberClass &&
          profile.xroad?.memberCode &&
          profile.xroad?.subsystem &&
          profile.hasCert
        )
      ) {
        router.push("/setup");
        return;
      }

      // Cargar proveedores
      let list = await getProviders();

      if (list.length === 0) {
        console.log("⚙️ Ejecutando descubrimiento automático...");
        await refreshProviders();
        list = await getProviders();
      }

      setProviders(list);
      setAuthChecked(true);
    } catch (err) {
      console.error("Error inicial:", err);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  })();
}, [router]);



  if (!authChecked) {
    return <div className="p-4 text-gray-600">Verificando sesión...</div>;
  }

  // --- REFRESH manual
  async function handleRefresh() {
    setLoading(true);
    await refreshProviders();
    const list = await getProviders();
    setProviders(list);
    setLoading(false);
  }

  // --- LOGOUT
  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  // --- Abrir modal con servicios
  async function openModal(provider: ProviderSummary) {
    setModalProvider(provider);
    const resp = await getProviderServices(provider.id);
    setServices(resp.services);
    setSelectedService(null);
    setFiles(null);
  }

  // --- Cargar archivos del servicio
  async function handleSelectService(svc: ServiceSummary) {
    setSelectedService(svc);
    setFilesLoading(true);
    try {
      const ep = svc.endpoints[0];
      const { items } = await getFilesForEndpoint(modalProvider!.id, svc.code, ep.path);
      setFiles(items);
    } catch {
      setFiles([]);
    }
    setFilesLoading(false);
  }

  function downloadUrl(name: string) {
    const ep = selectedService!.endpoints[0];
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${modalProvider!.id}&serviceCode=${selectedService!.code}&endpointPath=${ep.path}&filename=${name}&mode=download`;
  }

  function previewUrl(name: string) {
    const ep = selectedService!.endpoints[0];
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?providerId=${modalProvider!.id}&serviceCode=${selectedService!.code}&endpointPath=${ep.path}&filename=${name}&mode=preview`;
  }

  // --- Render principal
  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Proveedores detectados</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
          >
            🔄 Actualizar
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Estados */}
      {loading && <p className="text-gray-600">Cargando...</p>}
      {!loading && providers.length === 0 && (
        <p className="text-gray-500 text-sm">No hay proveedores detectados aún.</p>
      )}

      {/* Tabla de proveedores */}
      {!loading && providers.length > 0 && (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Subsystem</th>
              <th className="p-2">Servicios</th>
              <th className="p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.displayName}</td>
                <td className="p-2">{p.hasServices ? "✅ Sí" : "❌ No"}</td>
                <td className="p-2">
                  <button
                    onClick={() => (p.hasServices ? openModal(p) : null)}
                    className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
                    disabled={!p.hasServices}
                  >
                    🔍 Ver servicios
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MODAL */}
      {modalProvider && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 relative">
            {/* Header modal */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Servicios — {modalProvider.displayName}
              </h2>
              <button
                onClick={() => setModalProvider(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Servicios */}
            {!selectedService && services && (
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {services.map((svc) => (
                  <div
                    key={svc.code}
                    className="p-3 border rounded flex justify-between items-center"
                  >
                    <div>
                      <strong>{svc.code}</strong>
                      <div className="text-xs text-gray-500">
                        {svc.type || "REST"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelectService(svc)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded"
                    >
                      📂 Ver archivos
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Archivos */}
            {selectedService && (
              <div>
                <button
                  onClick={() => {
                    setSelectedService(null);
                    setFiles(null);
                  }}
                  className="text-sm mb-4 underline text-blue-700"
                >
                  ← Volver a servicios
                </button>

                {filesLoading && <p>Cargando archivos...</p>}

                {!filesLoading && files && (
                  <ul className="space-y-2 max-h-[60vh] overflow-auto">
                    {files.length === 0 && (
                      <p className="text-sm text-gray-500">
                        No hay archivos disponibles.
                      </p>
                    )}
                    {files.map((f) => (
                      <li
                        key={f}
                        className="p-3 border rounded flex justify-between items-center"
                      >
                        <span className="truncate">{f}</span>
                        <div className="flex gap-2">
                          <a
                            href={previewUrl(f)}
                            target="_blank"
                            className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm"
                          >
                            👁 Ver
                          </a>
                          <a
                            href={downloadUrl(f)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            ⬇ Descargar
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
