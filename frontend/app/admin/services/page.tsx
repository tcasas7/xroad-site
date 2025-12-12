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
import { Loader2, Server, Users, Folder, FileText, ShieldCheck, Save } from "lucide-react";


type PermissionService = {
  id: string;
  serviceCode: string;
  serviceVersion: string | null;
  endpoints: { id: string; method: string; path: string }[];
  servicePermission: {
    canView: boolean;
    canDownload: boolean;
    canUpload: boolean;
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
    Record<string, { canView: boolean; canDownload: boolean; canUpload: boolean }>
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

  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<string | null>(null);

  const activeProviderObj =
  providers.find((p) => p.id === activeProvider) || null;

  const activeServiceObj =
    activeProviderObj?.services.find((s) => s.id === activeService) || null;

  const activeServiceFiles = activeService
    ? filesByService[activeService] || []
    : [];

  // Servicios con permiso de subida habilitado para el usuario seleccionado
  const uploadEnabledServices =
    selectedUser && providers.length
      ? providers.flatMap((prov) =>
          prov.services
            .filter((svc) => servState[svc.id]?.canUpload)
            .map((svc) => ({ prov, svc }))
        )
      : [];


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
          canUpload: svc.servicePermission.canUpload ?? false,
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
          canUpload: perms.canUpload,
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


if (loading && !selectedUser) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-gray-600">
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Cargando administración...</span>
      </div>
    </div>
  );
}

return (
  <div className="p-6 max-w-6xl mx-auto space-y-6">
    {/* HEADER */}
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">
            Gestión de Servicios, Archivos y Permisos
          </h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Panel de administración para definir qué proveedores, servicios y
          archivos puede usar cada usuario.
        </p>
      </div>

      {selectedUser && (
        <div className="border rounded-lg px-4 py-2 bg-gray-50 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="font-medium">
              Usuario seleccionado:{" "}
              {users.find((u) => u.id === selectedUser)?.pin}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Rol: {users.find((u) => u.id === selectedUser)?.role}
          </div>
        </div>
      )}
    </div>

    {/* STEPPER SIMPLE */}
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
        1. Usuario
      </span>
      <span>→</span>
      <span
        className={`px-2 py-1 rounded-full ${
          selectedUser ? "bg-blue-50 text-blue-700" : "bg-gray-100"
        }`}
      >
        2. Proveedores
      </span>
      <span>→</span>
      <span
        className={`px-2 py-1 rounded-full ${
          activeProvider ? "bg-blue-50 text-blue-700" : "bg-gray-100"
        }`}
      >
        3. Servicios
      </span>
      <span>→</span>
      <span
        className={`px-2 py-1 rounded-full ${
          activeService ? "bg-blue-50 text-blue-700" : "bg-gray-100"
        }`}
      >
        4. Archivos
      </span>
    </div>

    {/* SELECCIÓN DE USUARIO */}
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <label className="block text-sm font-medium mb-2 flex items-center gap-2">
        <Users className="w-4 h-4 text-gray-500" />
        Seleccionar usuario
      </label>
      <select
        className="border p-2 rounded w-full text-sm"
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

      {!selectedUser && (
        <p className="text-xs text-gray-500 mt-2">
          Elegí un usuario para comenzar a configurar sus permisos.
        </p>
      )}
    </div>

    {/* RESUMEN CONTEXTO */}
    {selectedUser && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg bg-white p-3 text-xs text-gray-600 col-span-1 md:col-span-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-gray-500" />
              <span>
                Proveedor activo:{" "}
                <span className="font-medium">
                  {activeProviderObj?.displayName || "ninguno seleccionado"}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-gray-500" />
              <span>
                Servicio activo:{" "}
                <span className="font-medium">
                  {activeServiceObj?.serviceCode || "ninguno seleccionado"}
                </span>
              </span>
            </div>
            {activeService && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span>
                  Archivos listados:{" "}
                  <span className="font-medium">
                    {activeServiceFiles.length}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* GRID PRINCIPAL */}
    {selectedUser && (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* ============================
              COL 1: PROVEEDORES
            ============================= */}
          <div className="border rounded-lg bg-white p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-600" />
                Proveedores
              </h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Seleccioná un proveedor para ver sus servicios. Activar la casilla
              para que el usuario pueda ver el proveedor. Hacer click sobre los proveedores 
              para habilitar servicios de cada proveedor.
            </p>

            <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
              {providers.map((prov) => {
                const enabled = provState[prov.id] || false;
                return (
                  <div
                    key={prov.id}
                    className={`p-2 rounded-lg cursor-pointer border text-sm transition ${
                      prov.id === activeProvider
                        ? "bg-blue-50 border-blue-300"
                        : "bg-white hover:bg-gray-50 border-gray-200"
                    }`}
                    onClick={() => {
                      setActiveProvider(prov.id);
                      setActiveService(null);
                    }}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-medium">{prov.displayName}</div>
                        <div className="text-[11px] text-gray-500">
                          {prov.xRoadInstance}/{prov.memberClass}/
                          {prov.memberCode}
                          {prov.subsystemCode
                            ? `/${prov.subsystemCode}`
                            : ""}
                        </div>
                        {enabled && (
                          <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                            Proveedor habilitado
                          </span>
                        )}
                      </div>

                      <label
                        className="flex items-center gap-1 text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={enabled}
                          onChange={(e) =>
                            setProvState((p) => ({
                              ...p,
                              [prov.id]: e.target.checked,
                            }))
                          }
                        />
                        Ver
                      </label>
                    </div>
                  </div>
                );
              })}

              {providers.length === 0 && (
                <p className="text-xs text-gray-500">
                  No hay proveedores configurados para este usuario.
                </p>
              )}
            </div>
          </div>

          {/* ============================
              COL 2: SERVICIOS
            ============================= */}
          <div className="border rounded-lg bg-white p-4 shadow-sm flex flex-col">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <Folder className="w-4 h-4 text-gray-600" />
              Servicios
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Elegí un servicio del proveedor activo para definir si el usuario
              puede verlo y descargar sus resultados.
            </p>

            {!activeProvider && (
              <p className="text-xs text-gray-500 mt-2">
                Seleccioná primero un proveedor en la columna izquierda.
              </p>
            )}

            {activeProvider && (
              <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
                {activeProviderObj?.services.map((svc) => {
                  const svcPerms = servState[svc.id] || {
                    canView: false,
                    canDownload: false,
                  };
                  return (
                    <div
                      key={svc.id}
                      className={`p-2 rounded-lg border cursor-pointer text-sm transition ${
                        svc.id === activeService
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white hover:bg-gray-50 border-gray-200"
                      }`}
                      onClick={() => setActiveService(svc.id)}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {svc.serviceCode}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border">
                              v{svc.serviceVersion || "1"}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1">
                            Endpoints: {svc.endpoints.length}
                          </div>
                        </div>

                        <div
                          className="flex flex-col gap-1 text-[11px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={svcPerms.canView}
                              onChange={(e) =>
                                setServState((s) => ({
                                  ...s,
                                  [svc.id]: {
                                    ...s[svc.id],
                                    canView: e.target.checked,
                                    // si pierde canView => desactivar todo
                                    canDownload: e.target.checked ? s[svc.id].canDownload : false,
                                    canUpload: e.target.checked ? s[svc.id].canUpload : false,
                                  },
                                }))
                              }
                            />
                            Ver
                          </label>
                          <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                checked={svcPerms.canDownload}
                                disabled={!svcPerms.canView}
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
                            <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={svcPerms.canUpload}
                              disabled={!svcPerms.canView}
                              onChange={(e) =>
                                setServState((s) => ({
                                  ...s,
                                  [svc.id]: {
                                    ...s[svc.id],
                                    canUpload: e.target.checked,
                                  },
                                }))
                              }
                            />
                            Subir
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activeProviderObj?.services.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Este proveedor no tiene servicios configurados.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ============================
              COL 3: ARCHIVOS
            ============================= */}
          <div className="border rounded-lg bg-white p-4 shadow-sm flex flex-col">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-600" />
              Archivos
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Cargá los archivos del servicio seleccionado y elegí cuáles puede
              ver y/o descargar este usuario.
            </p>

            {!activeService && (
              <p className="text-xs text-gray-500">
                Seleccioná primero un servicio en la columna central.
              </p>
            )}

            {activeService && (
              <>
                <button
                  className="inline-flex items-center text-xs px-3 py-1.5 rounded border bg-gray-50 hover:bg-gray-100 mb-3 self-start"
                  onClick={() =>
                    handleLoadFilesForService(
                      activeProviderObj!,
                      activeServiceObj!
                    )
                  }
                  disabled={!!loadingFilesFor}
                >
                  {loadingFilesFor === activeService ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Cargando archivos...
                    </>
                  ) : (
                    <>
                      <Folder className="w-3 h-3 mr-1" />
                      Cargar / actualizar lista de archivos
                    </>
                  )}
                </button>

                {activeServiceFiles.length === 0 && (
                  <p className="text-xs text-gray-500">
                    No hay archivos listados aún para este servicio o todavía no
                    se cargaron.
                  </p>
                )}

                {activeServiceFiles.length > 0 && (
                  <div className="space-y-2 overflow-y-auto max-h-[360px] pr-1">
                    {activeServiceFiles.map((fname) => {
                      const fPerms =
                        filePermState[activeService]?.[fname] || {
                          canView: false,
                          canDownload: false,
                        };

                      return (
                        <div
                          key={fname}
                          className="p-2 bg-gray-50 rounded-lg border flex justify-between items-start text-xs"
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="w-3 h-3 mt-0.5 text-gray-500" />
                            <span className="break-all">{fname}</span>
                          </div>

                          <div className="flex flex-col gap-1 ml-4">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                checked={fPerms.canView}
                                onChange={(e) =>
                                  setFilePermState((prev) => ({
                                    ...prev,
                                    [activeService]: {
                                      ...(prev[activeService] || {}),
                                      [fname]: {
                                        ...(prev[activeService]?.[fname] || {
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
                                className="h-3 w-3"
                                checked={fPerms.canDownload}
                                onChange={(e) =>
                                  setFilePermState((prev) => ({
                                    ...prev,
                                    [activeService]: {
                                      ...(prev[activeService] || {}),
                                      [fname]: {
                                        ...(prev[activeService]?.[fname] || {
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
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RESUMEN DE PERMISOS DE SUBIDA */}
        <div className="mt-4 border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">
            Permisos para subir archivos
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Aquí ves en qué servicios tiene habilitado este usuario la opción de{" "}
            <span className="font-semibold">Subir</span>. Podés activar o
            desactivar ese permiso desde la columna de servicios de arriba.
          </p>

          {uploadEnabledServices.length === 0 ? (
            <p className="text-xs text-gray-500">
              Actualmente este usuario no tiene habilitado subir archivos en
              ningún servicio.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Proveedor</th>
                    <th className="px-3 py-2 text-left">Servicio</th>
                    <th className="px-3 py-2 text-left">Versión</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadEnabledServices.map(({ prov, svc }) => (
                    <tr key={`${prov.id}-${svc.id}`} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-800">
                            {prov.displayName}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {prov.xRoadInstance}/{prov.memberClass}/
                            {prov.memberCode}
                            {prov.subsystemCode ? `/${prov.subsystemCode}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-gray-800">
                          {svc.serviceCode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        v{svc.serviceVersion || "1"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FOOTER GUARDAR (STICKY) */}
        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white pt-4 mt-4 border-t flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2 rounded-md text-sm shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando cambios...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </>
    )}
  </div>
);

}


