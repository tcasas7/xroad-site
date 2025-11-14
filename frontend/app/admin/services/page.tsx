"use client";

import { useEffect, useState } from "react";
import {
  getAdminUsers,
  getUserPermissions,
  saveUserPermissions,
  getProfileXroad,
} from "@/lib/api";
import { useRouter } from "next/navigation";

type PermissionService = {
  id: string;
  serviceCode: string;
  serviceVersion: string | null;
  servicePermission: {
    canView: boolean;
    canDownload: boolean;
  };
};

type PermissionProvider = {
  id: string;
  displayName: string;
  xRoadInstance: string;
  memberClass: string;
  memberCode: string;
  subsystemCode: string | null;
  providerPermission: {
    canView: boolean;
  };
  services: PermissionService[];
};


export default function AdminServicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");

  const [providers, setProviders] = useState<PermissionProvider[]>([]);
  const [saving, setSaving] = useState(false);

  // Estados editables
  const [provState, setProvState] = useState<Record<string, boolean>>({});
  const [servState, setServState] = useState<
    Record<string, { canView: boolean; canDownload: boolean }>
  >({});

  // Seguridad de admin
  useEffect(() => {
    (async () => {
      const profile = await getProfileXroad();
      if (!profile.userRole || profile.userRole !== "ADMIN") {
        router.push("/");
        return;
      }

      const resp = await getAdminUsers();
      setUsers(resp.users);

      setLoading(false);
    })();
  }, [router]);

  async function loadPermissions(userId: string) {
    setSelectedUser(userId);
    setProviders([]);
    setProvState({});
    setServState({});
    setLoading(true);

    const data = await getUserPermissions(userId);

    setProviders(data.providers);

    // Mapear estado
    const pState: Record<string, boolean> = {};
    const sState: Record<string, any> = {};

    for (const prov of data.providers) {
      pState[prov.id] = prov.providerPermission.canView;

      for (const svc of prov.services) {
        sState[svc.id] = {
          canView: svc.servicePermission.canView,
          canDownload: svc.servicePermission.canDownload,
        };
      }
    }

    setProvState(pState);
    setServState(sState);
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedUser) return;

    setSaving(true);

    const providerPermissions = Object.entries(provState).map(
      ([providerId, canView]) => ({ providerId, canView })
    );

    const servicePermissions = Object.entries(servState).map(
      ([serviceId, perms]) => ({
        serviceId,
        canView: perms.canView,
        canDownload: perms.canDownload,
      })
    );

    await saveUserPermissions(selectedUser, {
      providerPermissions,
      servicePermissions,
    });

    setSaving(false);
    alert("Permisos actualizados correctamente.");
  }

  if (loading && !selectedUser)
    return <div className="p-6">Cargando administración...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">🗂 Gestión de Servicios y Permisos</h1>

      {/* Selección de usuario */}
      <div className="p-4 border rounded bg-gray-50">
        <label className="block text-sm font-medium mb-2">
          Seleccionar usuario
        </label>
        <select
          className="border p-2 rounded w-full"
          value={selectedUser}
          onChange={(e) => loadPermissions(e.target.value)}
        >
          <option value="">-- Elegir usuario --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.pin} ({u.role})
            </option>
          ))}
        </select>
      </div>

      {/* Si no hay usuario seleccionado */}
      {!selectedUser && (
        <p className="text-gray-600 text-sm">Seleccioná un usuario para continuar.</p>
      )}

      {/* Lista de providers y servicios */}
      {selectedUser && providers.length > 0 && (
        <div className="space-y-4">
          {providers.map((prov) => (
            <div key={prov.id} className="border rounded p-4 bg-white shadow-sm">
              {/* Header Provider */}
              <div className="flex items-center justify-between">
                <div>
                  <strong>{prov.displayName}</strong>
                  <div className="text-xs text-gray-500">
                    {prov.xRoadInstance}/{prov.memberClass}/{prov.memberCode}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={provState[prov.id] || false}
                    onChange={(e) =>
                      setProvState((p) => ({ ...p, [prov.id]: e.target.checked }))
                    }
                  />
                  Ver proveedor
                </label>
              </div>

              {/* Services */}
              <div className="pl-4 mt-3 space-y-2">
                {prov.services.map((svc) => (
                  <div key={svc.id} className="p-3 border rounded">
                    <div className="flex justify-between items-center">
                      <div>
                        <strong>{svc.serviceCode}</strong>
                        <div className="text-xs text-gray-500">
                          v{svc.serviceVersion || "1"}
                        </div>
                      </div>

                      <div className="flex gap-4">
                        {/* Ver servicio */}
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={servState[svc.id]?.canView || false}
                            onChange={(e) =>
                              setServState((s) => ({
                                ...s,
                                [svc.id]: {
                                  ...s[svc.id],
                                  canView: e.target.checked,
                                },
                              }))
                            }
                          />
                          Ver
                        </label>

                        {/* Descargar */}
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={servState[svc.id]?.canDownload || false}
                            onChange={(e) =>
                              setServState((s) => ({
                                ...s,
                                [svc.id]: {
                                  ...s[svc.id],
                                  canDownload: e.target.checked,
                                },
                              }))
                            }
                          />
                          Descargar
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
