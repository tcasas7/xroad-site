"use client";

import { useState, useEffect } from "react";
import {
  getProviders,
  refreshProviders,
  getProviderServices,
  getFilesForEndpoint,
} from "@/lib/api";
import { ProviderSummary, ServiceSummary, EndpointSummary } from "./types/xroad";

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / selector
  const [modalProvider, setModalProvider] = useState<ProviderSummary | null>(
    null
  );
  const [services, setServices] = useState<ServiceSummary[] | null>(null);

  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(
    null
  );
  const [files, setFiles] = useState<string[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getProviders();
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    await refreshProviders();
    await load();
  }

  // Cargar proveedores on mount
  useEffect(() => {
    load();
  }, []);

  async function openModal(provider: ProviderSummary) {
    setModalProvider(provider);
    const resp = await getProviderServices(provider.id);
    setServices(resp.services);
    setSelectedService(null);
    setFiles(null);
  }

  async function handleSelectService(svc: ServiceSummary) {
    setSelectedService(svc);
    setFilesLoading(true);
    try {
      const firstEndpoint = svc.endpoints[0]; // en esta versión: agarramos el 1er endpoint válido
      const resp = await getFilesForEndpoint(
        modalProvider!.id,
        svc.code,
        firstEndpoint.path
      );
      setFiles(resp.items);
    } catch (e) {
      setFiles([]);
    }
    setFilesLoading(false);
  }

  function downloadUrl(name: string) {
    const params = new URLSearchParams({
      providerId: modalProvider!.id,
      serviceCode: selectedService!.code,
      endpointPath: selectedService!.endpoints[0].path,
      filename: name,
      mode: "download",
    });
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?${params.toString()}`;
  }

  function previewUrl(name: string) {
    const params = new URLSearchParams({
      providerId: modalProvider!.id,
      serviceCode: selectedService!.code,
      endpointPath: selectedService!.endpoints[0].path,
      filename: name,
      mode: "preview",
    });
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?${params.toString()}`;
  }

  return (
    <div className="p-4">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Proveedores detectados</h1>
        <button
          onClick={handleRefresh}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Loading */}
      {loading && <p>Cargando...</p>}

      {/* Sin resultados */}
      {!loading && providers.length === 0 && (
        <p className="text-gray-600 text-sm">
          No hay proveedores detectados aún.
        </p>
      )}

      {/* Tabla */}
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
                <td className="p-2">
                  {p.hasServices ? "✅ Sí" : "❌ No"}
                </td>
                <td className="p-2">
                  <button
                    onClick={() =>
                      p.hasServices ? openModal(p) : null
                    }
                    className="flex items-center gap-1 bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
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
              >✕</button>
            </div>

            {/* Si NO se eligió servicio todavía: listar servicios */}
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

            {/* Si SE eligió servicio: mostrar archivos */}
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
