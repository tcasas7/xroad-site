"use client";

import React, { useState } from "react";
import { EndpointsModalProps, EndpointSummary } from "../types/xroad";
import ExplorerModal from "./ExplorerModel";

export function EndpointsModal({
  provider,
  service,
  endpoints,
  onClose,
}: EndpointsModalProps) {
  const [exploring, setExploring] = useState<{
    serviceCode: string;
    endpointPath: string;
  } | null>(null);

  function handleUseEndpoint(method: string, path: string) {
    setExploring({
      serviceCode: service.code,
      endpointPath: path,
    });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[999] px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 relative">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            Endpoints disponibles - {service.code}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Endpoints list */}
        <div className="space-y-3 max-h-[60vh] overflow-auto">
          {endpoints.length === 0 && (
            <p className="text-sm text-gray-500">
              Este servicio no tiene endpoints publicados.
            </p>
          )}

          {endpoints.map((ep: EndpointSummary) => (
            <div
              key={`${ep.method}-${ep.path}`}
              className="flex justify-between items-center p-3 border rounded"
            >
              <div>
                <span className="font-medium">{ep.method}</span>{" "}
                <code>{ep.path}</code>
              </div>
              <button
                onClick={() => handleUseEndpoint(ep.method, ep.path)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded flex items-center gap-1"
              >
                📂 Ver archivos
              </button>
            </div>
          ))}
        </div>
      </div>

      {exploring && (
        <ExplorerModal
          providerId={provider.id}
          providerDisplayName={provider.displayName || ""}
          serviceCode={exploring.serviceCode}
          endpointPath={exploring.endpointPath}
          onClose={() => setExploring(null)}
        />
      )}
    </div>
  );
}
