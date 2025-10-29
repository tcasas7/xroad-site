const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function refreshProviders() {
  const resp = await fetch(`${API_URL}/api/providers/refresh`, {
    method: "POST",
  });
  if (!resp.ok) throw new Error("Error refreshing providers");
  return resp.json();
}

export async function getProviders() {
  const resp = await fetch(`${API_URL}/api/providers`);
  if (!resp.ok) throw new Error("Error fetching providers");
  return resp.json();
}

export async function getProviderServices(id: string) {
  const resp = await fetch(`${API_URL}/api/providers/${id}/services`, {
    cache: "no-store",
  });
  if (!resp.ok) throw new Error("Error fetching provider services");
  return resp.json();
}

export async function getFilesForEndpoint(
  providerId: string,
  serviceCode: string,
  endpointPath: string
) {
  const params = new URLSearchParams({
    providerId,
    serviceCode,
    endpointPath,
  });

  const resp = await fetch(
    `${API_URL}/api/xroad/files?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!resp.ok) throw new Error("Error fetching xroad files");

  return resp.json();
}
