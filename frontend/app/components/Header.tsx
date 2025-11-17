"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, logout } from "@/lib/api";
import Link from "next/link";
import { LogOut, LayoutDashboard, RefreshCcw } from "lucide-react";

type HeaderProps = {
  onRefresh: () => void | Promise<void>;
};

export default function Header({ onRefresh }: HeaderProps) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (me?.user?.role === "ADMIN") {
        setIsAdmin(true);
      }
    })();
  }, []);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="w-full border-b bg-white px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="bg-blue-600 text-white rounded-lg px-3 py-1 font-bold">X</div>
        <span className="font-semibold text-lg">Portal X-ROAD</span>
      </div>

      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1 bg-gray-800 text-white px-3 py-1 rounded text-sm"
          >
            <LayoutDashboard size={16} /> Admin
          </Link>
        )}
        
        {/*<button
          onClick={onRefresh}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
        >
          <RefreshCcw size={16} /> Actualizar
        </button>*/}

        <button
          onClick={handleLogout}
          className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
        >
          <LogOut size={16} /> Salir
        </button>
      </div>
    </header>
  );
}
