"use client";

import { useEffect, useState } from "react";
import {
  getAdminUsers,
  getUserPermissions,
  saveUserPermissions,
  getProfileXroad,
  getFilesForEndpoint,
  getUserFilePermissions,
  saveUserFilePermissions,
} from "@/lib/api";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type PermissionService = {
  id: string;
  serviceCode: string;
  serviceVersion: string | null;
  endpoints: { id: string; method: string; path: string }[];
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

type FilePerm = {
  canView: boolean;
  canDownload: boolean;
};

export default function AdminServicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");

  const [providers, setProviders] = useState<PermissionProvider[]>([]);
  const [saving, setSaving] = useState(false);

  // Estado de providers y servicios (lo que ya tenías)
  const [provState, setProvState] = useState<Record<string, boolean>>({});
  const [servState, setServState] = useState<
    Record<string, { canView: boolean; canDownload: boolean }>
  >({});

  // 🔹 Archivos por servicio (lista traída desde X-Road)
  const [filesByService, setFilesByService] = useState<
    Record<string, string[]>
  >({});

  // 🔹 Permisos por archivo: filePermState[serviceId][filename] = {canView, canDownload}
  const [filePermState, setFilePermState] = useState<
    Record<string, Record<string, FilePerm>>
  >({});

  // Para mostrar spinner cuando se cargan archivos de un servicio concreto
  const [loadingFilesFor, setLoadingFilesFor] = useState<string | null>(null);

  // Seguridad de admin + carga de usuarios
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
    setFilesByService({});
    setFilePermState({});
    setLoading(true);

    const data = await getUserPermissions(userId);

    setProviders(data.providers);

    // Mapear estado base
    const pState: Record<string, boolean> = {};
    const sState: Record<string, any> = {};

    for (const prov of data.providers as PermissionProvider[]) {
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

  // 🔹 Cargar archivos + reglas de un servicio concreto
  async function handleLoadFilesForService(
  prov: PermissionProvider,
  svc: PermissionService
) {
  if (!selectedUser) return;

  const svcId = svc.id;
  const endpoint = svc.endpoints?.[0];
  if (!endpoint) {
    alert("Este servicio no tiene endpoints registrados.");
    return;
  }

  setLoadingFilesFor(svcId);

  try {
    // 🔥 ADMIN MODE → obtener SIEMPRE todos los archivos
    const filesResp = await getFilesForEndpoint(
      prov.id,
      svcId,
      endpoint.path,
      true // ← adminMode
    );

    const filenames: string[] = filesResp.items ?? [];

    setFilesByService((prev) => ({
      ...prev,
      [svcId]: filenames,
    }));

    // 2) Traer reglas actuales guardadas para este usuario
    const permResp = await getUserFilePermissions(selectedUser, svcId);
    const rules = permResp.rules ?? [];

    const rulesMap: Record<string, FilePerm> = {};
    for (const name of filenames) {
      const r = rules.find(
        (rr: { filename: string; canView: boolean; canDownload: boolean }) =>
          rr.filename === name
      );
      rulesMap[name] = {
        canView: r?.canView ?? false,
        canDownload: r?.canDownload ?? false,
      };
    }

    setFilePermState((prev) => ({
      ...prev,
      [svcId]: rulesMap,
    }));
  } catch (err) {
    console.error("Error cargando archivos / permisos de archivos:", err);
    alert("Error cargando archivos del servicio.");
  } finally {
    setLoadingFilesFor(null);
  }
}

  async function handleSave() {
    if (!selectedUser) return;

    setSaving(true);

    try {
      // 1) Guardar permisos de provider + service (lo que ya tenías)
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

      // 2) Guardar permisos de archivos por servicio
      for (const [serviceId, filesMap] of Object.entries(filePermState)) {
        const rules = Object.entries(filesMap).map(
          ([filename, perms]) => ({
            filename,
            canView: perms.canView,
            canDownload: perms.canDownload,
          })
        );

        await saveUserFilePermissions(selectedUser, serviceId, rules);
      }

      alert("Permisos actualizados correctamente.");
    } catch (err) {
      console.error("Error guardando permisos:", err);
      alert("Error guardando permisos.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !selectedUser)
    return <div className="p-6">Cargando administración...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">🗂 Gestión de Servicios, Archivos y Permisos</h1>

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

      {!selectedUser && (
        <p className="text-gray-600 text-sm">
          Seleccioná un usuario para ver y editar sus permisos.
        </p>
      )}

      {/* Lista de providers + servicios */}
      {selectedUser && providers.length > 0 && (
        <div className="space-y-4">
          {providers.map((prov) => (
            <div
              key={prov.id}
              className="border rounded p-4 bg-white shadow-sm"
            >
              {/* Header Provider */}
              <div className="flex items-center justify-between">
                <div>
                  <strong>{prov.displayName}</strong>
                  <div className="text-xs text-gray-500">
                    {prov.xRoadInstance}/{prov.memberClass}/{prov.memberCode}
                    {prov.subsystemCode ? `/${prov.subsystemCode}` : ""}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={provState[prov.id] || false}
                    onChange={(e) =>
                      setProvState((p) => ({
                        ...p,
                        [prov.id]: e.target.checked,
                      }))
                    }
                  />
                  Ver proveedor
                </label>
              </div>

              {/* Services */}
              <div className="pl-4 mt-3 space-y-3">
                {prov.services.map((svc) => {
                  const svcFileList = filesByService[svc.id] || [];
                  const svcFilePerms = filePermState[svc.id] || {};

                  return (
                    <div key={svc.id} className="p-3 border rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <strong>{svc.serviceCode}</strong>
                          <div className="text-xs text-gray-500">
                            v{svc.serviceVersion || "1"}
                          </div>
                        </div>

                        <div className="flex gap-4 items-center">
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

                          {/* Descargar servicio */}
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

                          {/* Botón cargar archivos */}
                          <button
                            onClick={() =>
                              handleLoadFilesForService(prov, svc)
                            }
                            className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                          >
                            {loadingFilesFor === svc.id ? (
                              <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />{" "}
                                Archivos...
                              </span>
                            ) : (
                              "Configurar archivos"
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Lista de archivos (si ya se cargaron) */}
                      {svcFileList.length > 0 && (
                        <div className="mt-3 border-t pt-3 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">
                            Archivos del servicio
                          </div>

                          {svcFileList.map((fname) => (
                            <div
                              key={fname}
                              className="flex justify-between items-center text-sm"
                            >
                              <span className="truncate mr-4">{fname}</span>

                              <div className="flex gap-4">
                                <label className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={
                                      svcFilePerms[fname]?.canView || false
                                    }
                                    onChange={(e) =>
                                      setFilePermState((prev) => ({
                                        ...prev,
                                        [svc.id]: {
                                          ...(prev[svc.id] || {}),
                                          [fname]: {
                                            ...(prev[svc.id]?.[fname] || {
                                              canView: false,
                                              canDownload: false,
                                            }),
                                            canView: e.target.checked,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                  Ver
                                </label>

                                <label className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={
                                      svcFilePerms[fname]?.canDownload || false
                                    }
                                    onChange={(e) =>
                                      setFilePermState((prev) => ({
                                        ...prev,
                                        [svc.id]: {
                                          ...(prev[svc.id] || {}),
                                          [fname]: {
                                            ...(prev[svc.id]?.[fname] || {
                                              canView: false,
                                              canDownload: false,
                                            }),
                                            canDownload: e.target.checked,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                  Descargar
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
