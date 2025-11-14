"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getActionLogs, getProfileXroad } from "@/lib/api";

// ---- Traducción de acciones ----
const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  UPLOAD_CERT: "Subió certificado",
  //DISCOVERY_REFRESH: "Descubrió proveedores",
  VIEW_FILE: "Listó archivos",
  PREVIEW_FILE: "Previsualizó archivo",
  DOWNLOAD_FILE: "Descargó archivo",
  CREATE_USER: "Creó usuario",
  DELETE_USER: "Eliminó usuario",
};

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

type LogEntry = {
  id: string;
  createdAt: string;
  action: string;
  details: string | null;
  hidden: boolean;
  user: { pin: string };
};

export default function HistoryPage() {
  const router = useRouter();

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionType, setActionType] = useState("");
  const [pinFilter, setPinFilter] = useState("");

  // Estado
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Control si estamos viendo historial completo o no
  const [includeHidden, setIncludeHidden] = useState(false);

  // Gate admin
  useEffect(() => {
    (async () => {
      const profile = await getProfileXroad();
      if (!profile?.userRole || profile.userRole !== "ADMIN") {
        router.push("/");
        return;
      }
      await loadLogs();
    })();
  }, [includeHidden]);

  async function loadLogs() {
    setLoading(true);
    try {
      const res = await getActionLogs({
        from: fromDate || undefined,
        to: toDate || undefined,
        action: actionType || undefined,
        pin: pinFilter || undefined,
        includeHidden,
      });

      const fetched = res.logs || [];
      const limited = includeHidden ? fetched : fetched.slice(0, 10);
      setLogs(limited);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setActionType("");
    setPinFilter("");
  }

  async function handleFilter() {
    await loadLogs();
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Historial</h1>

      {/* Vista resumida / completa */}
      <div className="flex justify-end mb-2">
        <button
          onClick={async () => {
            setIncludeHidden(!includeHidden);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          {includeHidden ? "Volver a vista resumida" : "Ver historial completo"}
        </button>
      </div>

      {/* Filtros */}
      <div className="border rounded p-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">Desde</label>
          <input
            type="date"
            className="border px-2 py-1 rounded w-full"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Hasta</label>
          <input
            type="date"
            className="border px-2 py-1 rounded w-full"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Acción</label>
          <select
            className="border px-2 py-1 rounded w-full"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
          >
            <option value="">(Todas)</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">PIN</label>
          <input
            type="text"
            className="border px-2 py-1 rounded w-full"
            placeholder="12345"
            value={pinFilter}
            onChange={(e) => setPinFilter(e.target.value)}
          />
        </div>

        <div />

        <div className="md:col-span-5 flex gap-2">
          <button
            onClick={handleFilter}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
          >
            Filtrar
          </button>
          <button
            onClick={clearFilters}
            className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded text-sm"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Fecha</th>
              <th className="p-2">PIN</th>
              <th className="p-2">Acción</th>
              <th className="p-2">Detalles</th>
              <th className="p-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-2 text-gray-500" colSpan={5}>
                  Cargando...
                </td>
              </tr>
            )}

            {!loading && logs.length === 0 && (
              <tr>
                <td className="p-2 text-gray-500" colSpan={5}>
                  Sin resultados.
                </td>
              </tr>
            )}

            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-t">
                  <td className="p-2">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2">{log.user?.pin || "-"}</td>
                  <td className="p-2">{getActionLabel(log.action)}</td>
                  <td className="p-2 text-gray-600">{log.details || "-"}</td>
                  <td className="p-2">{log.hidden ? "Oculto" : "Visible"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
