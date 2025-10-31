"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateUserPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, password, role }),
        }
      );

      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Error al crear usuario");

      router.push("/admin/users");
    } catch (err: any) {
      setError(err.message || "Error al crear usuario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">➕ Crear usuario</h1>
      <form onSubmit={handleSubmit} className="space-y-3">

        <div>
          <label className="block mb-1">PIN (5 dígitos)</label>
          <input
            type="text"
            className="border w-full p-2 rounded"
            value={pin}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              if (value.length <= 5) setPin(value);
            }}
            required
          />
        </div>

        <div>
          <label className="block mb-1">Contraseña inicial</label>
          <input
            type="password"
            className="border w-full p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block mb-1">Rol</label>
          <select
            className="border w-full p-2 rounded"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          disabled={loading}
          className="bg-green-600 text-white w-full py-2 rounded"
        >
          {loading ? "Creando..." : "Crear usuario"}
        </button>
      </form>
    </div>
  );
}
