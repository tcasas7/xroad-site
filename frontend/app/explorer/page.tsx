"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type FileItem = string;

export default function ExplorerPage() {
  const searchParams = useSearchParams();

  const providerId = searchParams.get("provider");
  const serviceCode = searchParams.get("service");
  const endpointPath = searchParams.get("path");
  const method = searchParams.get("method");

  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadFiles() {
    if (!providerId || !serviceCode || !endpointPath) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        providerId,
        serviceCode,
        endpointPath,
      });
      const resp = await fetch(`${API_URL}/api/xroad/files?${q.toString()}`);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(JSON.stringify(data.detail || data.error));
      }
      setFiles(data.items || []);
    } catch (err: any) {
      setError(err?.message || "Error cargando archivos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, [providerId, serviceCode, endpointPath]);

function downloadUrl(name: string) {
  const q = new URLSearchParams({
    providerId: providerId || "",
    serviceCode: serviceCode || "",
    endpointPath: endpointPath || "",
    filename: name,
    mode: "download",
  });
  return `${API_URL}/api/xroad/stream?${q.toString()}`;
}

function previewUrl(name: string) {
  const q = new URLSearchParams({
    providerId: providerId || "",
    serviceCode: serviceCode || "",
    endpointPath: endpointPath || "",
    filename: name,
    mode: "preview",
  });
  return `${API_URL}/api/xroad/stream?${q.toString()}`;
}

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-4">
        📁 Explorador de archivos
      </h1>

      <div className="text-sm text-gray-600 mb-6">
        <p><strong>Provider:</strong> {providerId}</p>
        <p><strong>Service:</strong> {serviceCode}</p>
        <p><strong>Endpoint:</strong> {endpointPath}</p>
        <p><strong>Method:</strong> {method}</p>
      </div>

      {loading && <p>Cargando archivos...</p>}

      {error && (
        <p className="bg-red-200 text-red-800 px-4 py-2 rounded">
          {error}
        </p>
      )}

      {!loading && !error && files.length === 0 && (
        <p className="text-gray-500">No se encontraron archivos.</p>
      )}

      {!loading && !error && files.length > 0 && (
        <ul className="divide-y border rounded">
          {files.map((f) => (
            <li key={f} className="flex justify-between items-center p-3">
              <div className="truncate">{f}</div>
              <div className="flex gap-2">
                <a
                  href={previewUrl(f)}
                  target="_blank"
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  👁 Ver
                </a>
                <a
                  href={downloadUrl(f)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  ⬇ Descargar
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
