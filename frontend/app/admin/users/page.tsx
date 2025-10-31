"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfileXroad } from "@/lib/api";

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 1. Verificar que sea ADMIN
  useEffect(() => {
    (async () => {
      const profile = await getProfileXroad();
      if (!profile.userRole || profile.userRole !== "ADMIN") {
        router.push("/");
        return;
      }
      fetchUsers(); // 👈 cargar usuarios cuando sea admin
    })();
  }, []);

  // ✅ 2. Función para traer usuarios del backend
  const fetchUsers = async () => {
    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`,
        { credentials: "include" }
      );
      const data = await resp.json();
      if (data.ok) {
        setUsers(data.users); // ✅ guardar en estado
      }
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    } finally {
      setLoading(false);
    }
  };

async function handleDelete(id: string) {
  if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;

  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${id}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  const data = await resp.json(); // ✅ Ya no rompe
  if (data.ok) {
    setUsers(users.filter((u) => u.id !== id));
  } else {
    alert("Error eliminando usuario");
  }
}


  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">👤 Administración de usuarios</h1>

      <button
        className="bg-green-600 text-white px-3 py-2 rounded mb-4"
        onClick={() => router.push("/admin/users/create")}
      >
        ➕ Crear usuario
      </button>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <table className="w-full border text-sm">
         <thead className="bg-gray-100">
        <tr>
            <th className="p-2 text-center">PIN</th>
            <th className="p-2 text-center">Rol</th>
            <th className="p-2 text-center">Primer login?</th>
            <th className="p-2 text-center">Acciones</th>
        </tr>
        </thead>
        <tbody>
        {users.map((u) => (
            <tr key={u.id} className="border-t">
            <td className="p-2 text-center">{u.pin}</td>
            <td className="p-2 text-center">{u.role}</td>
            <td className="p-2 text-center">
                {u.firstLoginDone ? "✅ Sí" : "❌ No"}
            </td>
            <td className="p-2 text-center">
                <button
                onClick={() => handleDelete(u.id)}
                className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                >
                🗑 Eliminar
                </button>
            </td>
            </tr>
        ))}
        </tbody>

        </table>
      )}
    </div>
  );
}
