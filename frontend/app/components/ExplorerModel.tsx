"use client";

import { useEffect, useState } from "react";

type ExplorerModalProps = {
  providerId: string;
  providerDisplayName: string;
  serviceCode: string;
  endpointPath: string;
  onClose: () => void;
};

export default function ExplorerModal({
  providerId,
  providerDisplayName,
  serviceCode,
  endpointPath,
  onClose,
}: ExplorerModalProps) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFiles() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        providerId,
        serviceCode,
        endpointPath,
      });
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/files?` + params.toString()
      );
      const data = await resp.json();
      if (!data.ok) throw new Error("Error al obtener lista");
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  function buildUrl(file: string, mode: "preview" | "download") {
    const params = new URLSearchParams({
      providerId,
      serviceCode,
      endpointPath,
      filename: file,
      mode,
    });
    return `${process.env.NEXT_PUBLIC_API_URL}/api/xroad/stream?${params.toString()}`;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-[1000]">
      <div className="bg-white rounded shadow-lg w-[600px] max-h-[80vh] overflow-auto p-6">

        {/* Header */}
        <h2 className="text-lg font-semibold mb-1">📂 Archivos disponibles</h2>
        <p className="text-sm text-gray-600 mb-4">
          {providerDisplayName} → {serviceCode} → {endpointPath}
        </p>

        {/* Loading / Error / Content */}
        {loading && <p className="text-sm text-gray-500">Cargando...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-gray-500">No hay archivos disponibles.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="divide-y mt-2">
            {items.map((file) => (
              <li
                key={file}
                className="py-2 flex justify-between items-center"
              >
                <span className="text-sm truncate max-w-[260px]">{file}</span>

                <div className="flex gap-2">
                  <a
                    href={buildUrl(file, "preview")}
                    target="_blank"
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    👁 Ver
                  </a>
                  <a
                    href={buildUrl(file, "download")}
                    className="text-green-600 hover:text-green-800 text-sm underline"
                  >
                    ⬇ Descargar
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 text-sm rounded"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
