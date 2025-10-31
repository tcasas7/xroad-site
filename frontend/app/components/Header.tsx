"use client";

import { logout } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  async function handleLogout() {
    await logout();        // backend borra cookie
    router.push("/login"); // redirigimos
  }

  return (
    <header className="w-full flex justify-between items-center px-4 py-3 border-b bg-white">
      <h1 className="text-lg font-semibold">Portal X-Road</h1>
      <button
        onClick={handleLogout}
        className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
      >
        🚪 Cerrar sesión
      </button>
    </header>
  );
}
