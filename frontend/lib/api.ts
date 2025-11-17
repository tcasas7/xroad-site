// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type LogsParams = {
  from?: string;
  to?: string;
  action?: string;
  pin?: string;
  includeHidden?: boolean;
};


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
    cache: "no-store",
  });

  const data = await resp.json();
  return data.providers ?? [];
}

export async function getProviderServices(id: string) {
  const resp = await fetch(`${API_URL}/api/providers/${id}/services`, {
    credentials: "include",
    cache: "no-store",
  });

  const data = await resp.json();

  const normalized = (data.services ?? []).map((s: any) => ({
    id: s.id,
    code: s.serviceCode,
    version: s.serviceVersion,
    type: s.serviceType ?? "REST",
    endpoints: s.endpoints ?? [],
  }));

  return { ok: data.ok, services: normalized };
}

export async function getFilesForEndpoint(
  providerId: string,
  serviceId: string,
  endpointPath: string,
  adminMode: boolean = false
) {
  const params = new URLSearchParams({
    providerId,
    serviceId,
    endpointPath,
  });

  if (adminMode) {
    params.append("adminMode", "1");
  }

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

export async function getActionLogs(params: LogsParams = {}) {
  const url = new URL(`${API_URL}/api/admin/logs`);

  if (params.from) url.searchParams.set("from", params.from);
  if (params.to) url.searchParams.set("to", params.to);
  if (params.action) url.searchParams.set("action", params.action);
  if (params.pin) url.searchParams.set("pin", params.pin);
  if (params.includeHidden) url.searchParams.set("includeHidden", "true");

  const resp = await fetch(url.toString(), {
    credentials: "include",
    cache: "no-store",
  });

  if (!resp.ok) {
    throw new Error("Error fetching logs");
  }

  return resp.json();
}

export async function hideLogsBulk(body: { before?: string; action?: string; pin?: string }) {
  const payload: any = {};

  if (body.before) payload.beforeDate = body.before;
  if (body.action) payload.action = body.action;
  if (body.pin) payload.pin = body.pin;

  const resp = await fetch(`${API_URL}/api/admin/logs/hide`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error("Error hiding logs");
  }

  return resp.json();
}


export async function getLogs(params?: {
  from?: string;
  to?: string;
  action?: string;
  includeHidden?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.action) query.set("action", params.action);
  if (params?.includeHidden) query.set("includeHidden", "true");

  const resp = await fetch(
    `${API_URL}/api/admin/logs?${query.toString()}`,
    { credentials: "include" }
  );
  return resp.json();
}

export async function hideOldLogs(beforeDate: string) {
  const resp = await fetch(`${API_URL}/api/admin/logs/hide`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beforeDate }),
  });
  return resp.json();
}

/** ==== ADMIN PERMISSIONS ==== */
export async function getAdminUsers() {
  const resp = await fetch(`${API_URL}/api/admin/users`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!resp.ok) throw new Error("Error fetching admin users");
  return resp.json();  
}

export async function getUserPermissions(userId: string) {
  const resp = await fetch(`${API_URL}/api/admin/users/${userId}/permissions`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!resp.ok) throw new Error("Error fetching user permissions");

  const data = await resp.json();

  // Normalizamos la estructura para que page.tsx reciba lo que espera
  return {
    user: data.user,
    providers: data.providers ?? [],
  };
}


export async function saveUserPermissions(
  userId: string,
  data: {
    providerPermissions: { providerId: string; canView: boolean }[];
    servicePermissions: {
      serviceId: string;
      canView: boolean;
      canDownload: boolean;
    }[];
  }
) {
  const resp = await fetch(`${API_URL}/api/admin/users/${userId}/permissions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!resp.ok) throw new Error("Error saving permissions");
  return resp.json();
}

export async function getMe() {
  const resp = await fetch(`${API_URL}/api/auth/me`, {
    credentials: "include"
  });

  if (!resp.ok) return null;
  return resp.json();
}

// 🔹 Obtener permisos de archivos para un user+service
export async function getUserFilePermissions(userId: string, serviceId: string) {
  const resp = await fetch(
    `${API_URL}/api/admin/users/${userId}/file-permissions/${serviceId}`,
    {
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!resp.ok) throw new Error("Error fetching file permissions");
  return resp.json(); // { ok, rules }
}

// 🔹 Guardar permisos de archivos para un user+service
export async function saveUserFilePermissions(
  userId: string,
  serviceId: string,
  rules: { filename: string; canView: boolean; canDownload: boolean }[]
) {
  const resp = await fetch(
    `${API_URL}/api/admin/users/${userId}/file-permissions/${serviceId}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    }
  );

  if (!resp.ok) throw new Error("Error saving file permissions");
  return resp.json();
}
