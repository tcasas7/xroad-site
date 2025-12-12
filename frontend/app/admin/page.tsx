"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfileXroad } from "@/lib/api";
import Link from "next/link";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const profile = await getProfileXroad();
      if (!profile.userRole || profile.userRole !== "ADMIN") {
        router.push("/"); // Redirigir si NO es admin
      }
    })();
  }, [router]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">⚙️ Panel de Administración</h1>

      <div className="space-y-3">
        <Link
          href="/admin/users"
          className="block bg-gray-100 hover:bg-gray-200 p-3 rounded"
        >
          👤 Gestión de Usuarios
        </Link>
        <Link
          href="/admin/history"
          className="block bg-gray-100 hover:bg-gray-200 p-3 rounded"
        >
          📜 Historial de Actividad
        </Link>
        <Link
          href="/admin/services"
          className="block bg-gray-100 hover:bg-gray-200 p-3 rounded"
        >
          🗂 Gestión de Servicios / Permisos
        </Link>
        <Link
          href="/admin/certificates"
          className="block bg-gray-100 hover:bg-gray-200 p-3 rounded"
        >
          🔐 Certificados X-Road
        </Link>
      </div>
    </div>
  );
}
