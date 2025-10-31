// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** ==== AUTH ==== */

export async function login(pin: string, password: string) {
  const resp = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, password }),
  });
  return resp.json();
}


export async function logout() {
  const resp = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include", 
  });
  return resp.json();
}

/** ==== DISCOVERY / XROAD ==== */

export async function refreshProviders() {
  const resp = await fetch(`${API_URL}/api/providers/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Error refreshing providers");
  return resp.json();
}

export async function getProviders() {
  const resp = await fetch(`${API_URL}/api/providers`, {
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Error fetching providers");
  return resp.json();
}

export async function getProviderServices(id: string) {
  const resp = await fetch(`${API_URL}/api/providers/${id}/services`, {
    credentials: "include",
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
    {
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!resp.ok) throw new Error("Error fetching files for endpoint");

  return resp.json();
}


/** ==== PROFILE / XROAD CONFIG ==== */
export async function saveXroadProfile(baseUrl: string, clientId: string) {
  const resp = await fetch(`${API_URL}/api/profile/xroad`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl, xRoadClient: clientId }),
  });
  if (!resp.ok) throw new Error("Error saving X-Road profile");
  return resp.json();
}

/** ==== PROFILE (X-ROAD) ==== */
export async function getProfileXroad() {
  const resp = await fetch(`${API_URL}/api/profile/xroad`, {
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Error fetching xroad profile");
  return resp.json();
}


/** ==== PROFILE XROAD SETUP ==== */

export async function setUserXroad(baseUrl: string, xRoadClient: string) {
  const resp = await fetch(`${API_URL}/api/profile/xroad`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseUrl, xRoadClient }),
  });

  if (!resp.ok) throw new Error("Error saving X-Road config");
  return resp.json();
}

export async function uploadCertificate(formData: FormData) {
  const resp = await fetch(`${API_URL}/api/profile/certificate`, {
    method: "POST",
    credentials: "include",
    body: formData, // NO Content-Type, fetch lo define sólo
  });

  if (!resp.ok) throw new Error("Error uploading certificate");
  return resp.json();
}
