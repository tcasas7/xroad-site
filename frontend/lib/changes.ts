export function detectChanges(current: any, previous: any) {
  const updates = {
    newProviders: [] as string[],
    newServices: [] as { providerId: string; serviceId: string }[],
    newFiles: [] as { providerId: string; serviceId: string; file: string }[],
  };

  // NUEVOS PROVEEDORES PERMITIDOS
  for (const prov of current.providers) {
    if (!previous.providers.includes(prov)) {
      updates.newProviders.push(prov);
    }
  }

  // NUEVOS SERVICIOS PERMITIDOS
  for (const prov of current.providers) {
    const curr = current.services[prov] || [];
    const prev = previous.services[prov] || [];

    for (const svc of curr) {
      if (!prev.includes(svc)) {
        updates.newServices.push({ providerId: prov, serviceId: svc });
      }
    }
  }

  // NUEVOS ARCHIVOS PERMITIDOS
  for (const key in current.files) {
    const curr = current.files[key] || [];
    const prev = previous.files[key] || [];

    for (const f of curr) {
      if (!prev.includes(f)) {
        const [providerId, serviceId] = key.split("::");
        updates.newFiles.push({ providerId, serviceId, file: f });
      }
    }
  }

  return updates;
}
