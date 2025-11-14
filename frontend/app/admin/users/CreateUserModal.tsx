"use client";

import { useState } from "react";

export function CreateUserModal({ onClose, onCreated }: any) {
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: any) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const resp = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin, password, role }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error");

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <form
        onSubmit={handleCreate}
        className="bg-white p-6 rounded shadow-md w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-semibold">➕ Crear nuevo usuario</h2>

        <input
          type="text"
          placeholder="Legajo (5 dígitos)"
          value={pin}
          maxLength={5}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="border w-full px-3 py-2 rounded"
          required
        />

        <input
          type="password"
          placeholder="Contraseña inicial"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border w-full px-3 py-2 rounded"
          required
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border w-full px-3 py-2 rounded"
        >
          <option value="USER">Usuario</option>
          <option value="ADMIN">Administrador</option>
        </select>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1">
            Cancelar
          </button>
          <button
            disabled={loading}
            className="bg-green-600 text-white px-3 py-1 rounded"
          >
            {loading ? "Creando..." : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
