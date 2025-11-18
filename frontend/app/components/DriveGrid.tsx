"use client";

import { useState } from "react";
import { MoreVertical, Eye, Download, Folder, FileText } from "lucide-react";

type DriveItem = {
  id: string;
  name: string;
  type: "folder" | "file";
};

type DriveGridProps = {
  items: DriveItem[];
  onOpen: (item: DriveItem) => void;
  onDownload?: (item: DriveItem) => void;
  onPreview?: (item: DriveItem) => void;
};

export default function DriveGrid({
  items,
  onOpen,
  onDownload,
  onPreview,
}: DriveGridProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {items.map((item: DriveItem) => {
        const isFile = item.type === "file";

        return (
          <div
            key={item.id}
            className="relative group cursor-pointer"
          >
            <div
              onClick={() => onOpen(item)}
              className="
                border rounded-xl p-4 bg-white shadow-sm hover:shadow-md 
                transition-all flex flex-col items-center justify-center
                gap-3 text-center
              "
            >
              {/* Ícono */}
              {item.type === "folder" ? (
                <Folder className="w-12 h-12 text-gray-600" />
              ) : (
                <FileText className="w-12 h-12 text-gray-600" />
              )}

              {/* Nombre */}
              <span className="text-sm font-medium truncate w-full">
                {item.name}
              </span>
            </div>

            {/* SOLO ARCHIVOS VEN EL MENÚ */}
            {isFile && (
              <button
                className="
                  absolute top-2 right-2 p-1 rounded-full bg-white border 
                  opacity-0 group-hover:opacity-100 transition
                "
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === item.id ? null : item.id);
                }}
              >
                <MoreVertical size={16} />
              </button>
            )}

            {/* Menú contextual */}
            {isFile && menuFor === item.id && (
              <div
                className="
                  absolute top-10 right-2 bg-white shadow-xl rounded-lg border 
                  w-40 py-2 z-20
                "
              >
                <button
                  className="w-full px-4 py-2 flex items-center gap-2 hover:bg-gray-100"
                  onClick={() => onPreview?.(item)}
                >
                  <Eye size={16} /> Ver
                </button>

                <button
                  className="w-full px-4 py-2 flex items-center gap-2 hover:bg-gray-100"
                  onClick={() => onDownload?.(item)}
                >
                  <Download size={16} /> Descargar
                </button>

                <div className="border-t my-2" />

                <p className="text-xs px-4 py-1 text-gray-400">
                  Opciones (próximamente)
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
