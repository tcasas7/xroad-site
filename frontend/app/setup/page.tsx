"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCertificate, setUserXroad } from "@/lib/api";

export default function SetupPage() {
  const router = useRouter();

  const [baseUrl, setBaseUrl] = useState("");
  const [xRoadClient, setXRoadClient] = useState("");
  const [p12File, setP12File] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!p12File) throw new Error("Debe seleccionar un archivo .p12");

      const form = new FormData();
      form.append("p12", p12File);
      form.append("passphrase", passphrase);
      await uploadCertificate(form);

      await setUserXroad(baseUrl, xRoadClient);

      alert("✅ Configuración guardada correctamente");
      router.push("/");
    } catch (e: any) {
      setError(e.message || "Error guardando configuración");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-md rounded-lg p-6 w-full max-w-md space-y-4"
      >
        <h1 className="text-xl font-semibold text-center">Configuración inicial</h1>
        <p className="text-gray-600 text-sm text-center">
          Cargue su certificado y credenciales X-Road
        </p>

        <div>
          <label className="text-sm text-gray-700">Base URL</label>
          <input
            type="text"
            placeholder="https://xroad.mi-servidor.com"
            className="border w-full px-3 py-2 rounded"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">X-Road Client</label>
          <input
            type="text"
            placeholder="INST/CLASS/MEMBER/SUBSYSTEM"
            className="border w-full px-3 py-2 rounded"
            value={xRoadClient}
            onChange={(e) => setXRoadClient(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Certificado (.p12)</label>
          <input
            type="file"
            accept=".p12"
            className="border w-full px-3 py-2 rounded"
            onChange={(e) => setP12File(e.target.files?.[0] || null)}
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Contraseña del certificado</label>
          <input
            type="password"
            className="border w-full px-3 py-2 rounded"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </form>
    </div>
  );
}
