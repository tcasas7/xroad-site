"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProfileXroad,
  getAdminUsers,
  adminGetUserCertificate,
  adminUploadUserCertificate,
  adminDeleteUserCertificate,
} from "@/lib/api";

type AdminUser = {
  id: string;
  pin: string;
  role: string;
};

type CertMeta = {
  id: string;
  fingerprint: string;
  subject: string;
  notBefore: string;
  notAfter: string;
  createdAt: string;
  updatedAt: string;
};

export default function AdminCertificatesPage() {
  const router = useRouter();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [cert, setCert] = useState<CertMeta | null>(null);
  const [hasCert, setHasCert] = useState<boolean | null>(null);
  const [loadingCert, setLoadingCert] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>("");

  // Gate admin + carga de usuarios
  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfileXroad();
        if (!profile.userRole || profile.userRole !== "ADMIN") {
          router.push("/");
          return;
        }
        const resp = await getAdminUsers();
        setUsers(resp.users || []);
      } catch (err) {
        console.error("Error loading admin data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function loadCertificate(userId: string) {
    setSelectedUserId(userId);
    setCert(null);
    setHasCert(null);
    setError("");
    setLoadingCert(true);
    try {
      const resp = await adminGetUserCertificate(userId);
      setHasCert(!!resp.hasCert);
      setCert(resp.cert || null);
    } catch (err: any) {
      console.error("Error fetching certificate:", err);
      setError(err.message || "Error cargando certificado");
    } finally {
      setLoadingCert(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    if (!file) {
      setError("Debes seleccionar un archivo .p12");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("p12", file);
      form.append("passphrase", passphrase);
      await adminUploadUserCertificate(selectedUserId, form);
      await loadCertificate(selectedUserId);
      alert("✅ Certificado cargado / reemplazado correctamente");
      setFile(null);
      setPassphrase("");
    } catch (err: any) {
      console.error("Error uploading certificate:", err);
      setError(err.message || "Error subiendo certificado");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedUserId) return;
    if (!confirm("¿Seguro que deseas eliminar el certificado de este usuario?")) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await adminDeleteUserCertificate(selectedUserId);
      setCert(null);
      setHasCert(false);
      alert("✅ Certificado eliminado");
    } catch (err: any) {
      console.error("Error deleting certificate:", err);
      setError(err.message || "Error eliminando certificado");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="p-6">Cargando administración de certificados...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">🔐 Certificados X-Road</h1>
          <p className="text-sm text-gray-600">
            Desde aquí podés ver, reemplazar o eliminar los certificados X-Road de cada usuario.
          </p>
        </div>

        {/* Selección de usuario */}
        <div className="bg-white rounded-lg shadow-sm p-4 border">
          <label className="block text-sm font-medium mb-2">Usuario</label>
          <select
            className="border rounded w-full px-3 py-2 text-sm"
            value={selectedUserId}
            onChange={(e) => e.target.value && loadCertificate(e.target.value)}
          >
            <option value="">-- Elegir usuario --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.pin} ({u.role})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Solo usuarios ADMIN pueden acceder a este apartado.
          </p>
        </div>

        {/* Detalle de certificado */}
        {selectedUserId && (
          <div className="bg-white rounded-lg shadow-sm p-4 border space-y-3">
            <h2 className="text-sm font-semibold">Estado del certificado</h2>

            {loadingCert ? (
              <p className="text-sm text-gray-500">Cargando certificado...</p>
            ) : hasCert === false ? (
              <p className="text-sm text-gray-600">
                Este usuario{" "}
                <span className="font-semibold">no tiene certificado cargado</span>.
              </p>
            ) : cert ? (
              <div className="text-sm space-y-1">
                <p>
                  <span className="font-semibold">Subject:</span> {cert.subject}
                </p>
                <p className="break-all">
                  <span className="font-semibold">Fingerprint:</span>{" "}
                  {cert.fingerprint}
                </p>
                <p>
                  <span className="font-semibold">Válido desde:</span>{" "}
                  {new Date(cert.notBefore).toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Válido hasta:</span>{" "}
                  {new Date(cert.notAfter).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                No se pudo obtener información del certificado.
              </p>
            )}

            {hasCert && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="mt-2 inline-flex items-center px-3 py-1.5 rounded text-xs bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {deleting ? "Eliminando..." : "Eliminar certificado"}
              </button>
            )}
          </div>
        )}

        {/* Formulario de reemplazo / carga */}
        {selectedUserId && (
          <form
            onSubmit={handleUpload}
            className="bg-white rounded-lg shadow-sm p-4 border space-y-3"
          >
            <h2 className="text-sm font-semibold">Subir / Reemplazar certificado</h2>
            <div>
              <label className="block text-sm mb-1">Archivo .p12</label>
              <input
                type="file"
                accept=".p12"
                className="border rounded w-full px-3 py-2 text-sm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Contraseña del certificado</label>
              <input
                type="password"
                className="border rounded w-full px-3 py-2 text-sm"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-blue-300"
            >
              {saving ? "Guardando..." : "Guardar certificado"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}


