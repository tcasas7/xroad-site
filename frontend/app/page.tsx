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

  /** INIT */
  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfileXroad();

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

        let list = await getProviders();

        if (profile.ok && list.length === 0) {
          
          setProviders([]);
          setAuthChecked(true);
          return;
        }


        setProviders(list);
        setAuthChecked(true);
      } catch (err) {
        console.error("Init error:", err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (!authChecked) return <div className="p-4">Verificando sesión...</div>;

  /** REFRESH */
  async function handleRefresh() {
    setLoading(true);

    try {
      await refreshProviders();
    } catch (err) {
      console.warn("Refresh failed (probably no permissions)", err);
    }

    const list = await getProviders();
    setProviders(list);
    setLoading(false);
  }

  /** LOGOUT */
  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  /** OPEN PROVIDER */
  async function openModal(provider: ProviderSummary) {
    setModalProvider(provider);
    const resp = await getProviderServices(provider.id);

    setServices(resp.services);
    setSelectedService(null);
    setFiles(null);
  }

  /** LOAD FILES FOR SERVICE */
  async function handleSelectService(svc: ServiceSummary) {
    setSelectedService(svc);
    setFilesLoading(true);

    try {
      const ep = svc.endpoints[0];

      const { items } = await getFilesForEndpoint(
        modalProvider!.id,
        svc.id,          // <-- serviceId REAL
        ep.path
      );

      setFiles(items);
    } catch (err) {
      console.error("FILE LOAD ERR:", err);
      setFiles([]);
    }

    setFilesLoading(false);
  }

  /** URLs */
  function previewUrl(name: string) {
    const ep = selectedService!.endpoints[0];

    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?` +
      `providerId=${modalProvider!.id}` +
      `&serviceId=${selectedService!.id}` +
      `&serviceCode=${selectedService!.code}` +
      `&endpointPath=${encodeURIComponent(ep.path)}` +
      `&filename=${encodeURIComponent(name)}` +
      `&mode=preview`;
  }

  function downloadUrl(name: string) {
    const ep = selectedService!.endpoints[0];

    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?` +
      `providerId=${modalProvider!.id}` +
      `&serviceId=${selectedService!.id}` +
      `&serviceCode=${selectedService!.code}` +
      `&endpointPath=${encodeURIComponent(ep.path)}` +
      `&filename=${encodeURIComponent(name)}` +
      `&mode=download`;
  }

  /** RENDER */
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Proveedores detectados</h1>

        <div className="flex gap-2">
          <button onClick={handleRefresh} className="bg-blue-600 text-white px-3 py-2 rounded">
            🔄 Actualizar
          </button>
          <button onClick={handleLogout} className="bg-red-600 text-white px-3 py-2 rounded">
            Salir
          </button>
        </div>
      </div>

      {loading && <p>Cargando...</p>}

      {!loading && providers.length === 0 && (
        <p className="text-gray-500 text-sm">No hay proveedores detectados.</p>
      )}

      {!loading && providers.length > 0 && (
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2">Subsystem</th>
              <th className="p-2">Servicios</th>
              <th className="p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.displayName}</td>
                <td className="p-2">{p.hasServices ? "Sí" : "No"}</td>
                <td className="p-2">
                  <button
                    disabled={!p.hasServices}
                    onClick={() => openModal(p)}
                    className="bg-gray-200 px-3 py-1 rounded text-sm"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Servicios — {modalProvider.displayName}
              </h2>
              <button onClick={() => setModalProvider(null)}>✕</button>
            </div>

            {!selectedService && services && (
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {services.map((svc) => (
                  <div key={svc.id} className="p-3 border rounded flex justify-between">
                    <div>
                      <strong>{svc.code}</strong>
                      <div className="text-xs text-gray-600">{svc.type || "REST"}</div>
                    </div>
                    <button
                      onClick={() => handleSelectService(svc)}
                      className="bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      📂 Ver archivos
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedService && (
              <div>
                <button
                  onClick={() => {
                    setSelectedService(null);
                    setFiles(null);
                  }}
                  className="text-blue-700 underline text-sm mb-4"
                >
                  ← Volver a servicios
                </button>

                {filesLoading && <p>Cargando archivos...</p>}

                {!filesLoading && files && (
                  <ul className="space-y-2 max-h-[60vh] overflow-auto">
                    {files.length === 0 && <p>No hay archivos disponibles.</p>}

                    {files.map((f) => (
                      <li
                        key={f}
                        className="p-3 border rounded flex justify-between items-center"
                      >
                        <span>{f}</span>

                        <div className="flex gap-2">
                          <a
                            href={previewUrl(f)}
                            target="_blank"
                            className="bg-gray-200 px-3 py-1 rounded"
                          >
                            👁 Ver
                          </a>

                          <a
                            href={downloadUrl(f)}
                            className="bg-green-600 text-white px-3 py-1 rounded"
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
