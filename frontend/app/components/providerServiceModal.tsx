"use client";

import { useState, useEffect } from "react";
import {
  ProviderSummary,
  ServiceSummary,
  EndpointSummary,
  ProviderServicesResponse,
} from "../types/xroad";
import { getProviderServices, getFilesForEndpoint } from "@/lib/api";

interface Props {
  providerId: string;
  onClose: () => void;
}

export default function ProviderServicesModal({ providerId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [providerName, setProviderName] = useState("");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceSummary | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data: ProviderServicesResponse = await getProviderServices(providerId);
        setProviderName(data.provider);
        setServices(data.services);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [providerId]);

  async function handleSelectService(svc: ServiceSummary) {
    // Elegimos el primer endpoint GET que normalmente es /files
    const ep = svc.endpoints.find((e) => e.method === "GET");
    if (!ep) return;

    setSelectedService(svc);
    setFileLoading(true);

    try {
      const data = await getFilesForEndpoint(providerId, svc.code, ep.path);
      setFiles(data.items || []);
    } finally {
      setFileLoading(false);
    }
  }

  function handleBack() {
    setSelectedService(null);
    setFiles([]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl rounded shadow p-6 relative">

        {/* Cerrar */}
        <button
          className="absolute top-3 right-3 text-gray-600 hover:text-gray-800"
          onClick={onClose}
        >
          ✕
        </button>

        {/* Vista servicios */}
        {!selectedService && (
          <>
            <h2 className="text-lg font-semibold mb-4">
              Servicios de {providerName}
            </h2>

            {loading ? (
              <p>Cargando...</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {services.map((svc) => (
                  <div
                    key={svc.code}
                    className="p-3 border rounded flex justify-between items-center"
                  >
                    <div>
                      <strong>{svc.code}</strong>
                      <div className="text-xs text-gray-500">{svc.type}</div>
                    </div>
                    <button
                      onClick={() => handleSelectService(svc)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                    >
                      📂 Ver archivos
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Vista archivos */}
        {selectedService && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleBack}
                className="text-blue-600 hover:underline text-sm"
              >
                ⬅ Volver a servicios
              </button>
              <h2 className="text-lg font-semibold">
                {selectedService.code} – Archivos
              </h2>
            </div>

            {fileLoading ? (
              <p>Cargando archivos...</p>
            ) : files.length === 0 ? (
              <p className="text-gray-500">No hay archivos disponibles.</p>
            ) : (
              <ul className="max-h-[50vh] overflow-auto space-y-2">
                {files.map((f) => (
                  <li
                    key={f}
                    className="flex justify-between items-center p-2 border rounded"
                  >
                    <span className="truncate max-w-[60%]">{f}</span>
                    <div className="flex gap-2">
                      <a
                        href={`/api/xroad/stream?providerId=${providerId}&serviceCode=${selectedService.code}&endpointPath=${selectedService.endpoints[0].path}&filename=${encodeURIComponent(
                          f
                        )}&mode=preview`}
                        target="_blank"
                        className="px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                      >
                        👁 Ver
                      </a>
                      <a
                        href={`/api/xroad/stream?providerId=${providerId}&serviceCode=${selectedService.code}&endpointPath=${selectedService.endpoints[0].path}&filename=${encodeURIComponent(
                          f
                        )}&mode=download`}
                        className="px-2 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
                      >
                        ⬇ Desc
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
