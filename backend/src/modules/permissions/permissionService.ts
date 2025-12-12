// src/modules/permissions/permissionService.ts
import { prisma } from "../../db/prisma";

/** ----------------------------------------------
 *  PROVIDER PERMISSIONS
 * ---------------------------------------------- */

export async function canViewProvider(userId: string, providerId: string) {
  const services = await prisma.service.findMany({
    where: { providerId },
    select: { id: true },
  });

  if (services.length === 0) return false;

  const perm = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      serviceId: { in: services.map((s) => s.id) },
      canView: true,
    },
  });

  return !!perm;
}


/** ----------------------------------------------
 *  SERVICE PERMISSIONS
 *  (USA serviceId REAL, NO serviceCode)
 * ---------------------------------------------- */
export async function canViewService(
  userId: string,
  providerId: string,
  serviceId: string
) {
  const base = await prisma.userPermissions.findUnique({
    where: { userId },
  });

  if (base?.canViewServices) return true;

  // permiso a nivel provider
  const providerLevel = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      providerId,
      canView: true,
      serviceId: null, // nivel proveedor
    },
  });

  if (providerLevel) return true;

  // permiso específico por servicio
  const perm = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      serviceId,
      canView: true,
    },
  });

  return !!perm;
}

export async function canDownloadService(
  userId: string,
  providerId: string,
  serviceId: string
) {
  // 1) Si tiene permiso a nivel proveedor → OK
  const prov = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      providerId,
      canDownload: true,
    },
  });

  if (prov) return true;

  // 2) Si tiene permiso específico del servicio → OK
  const svc = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      serviceId,
      canDownload: true,
    },
  });

  return !!svc;
}


/** ----------------------------------------------
 *  FILTER: VISIBLE PROVIDERS
 * ---------------------------------------------- */
export async function getVisibleProviders(userId: string) {
  return prisma.provider.findMany({
    where: {
      servicePermissions: {
        some: { userId, canView: true }
      }
    },
    orderBy: { displayName: "asc" }
  });
}

/** ----------------------------------------------
 *  FILTER: VISIBLE SERVICES
 * ---------------------------------------------- */
export async function getVisibleServices(userId: string, providerId: string) {
  return prisma.service.findMany({
    where: {
      providerId,
      servicePermissions: {
        some: { userId, canView: true },
      },
    },
    include: { endpoints: true },
    orderBy: { serviceCode: "asc" },
  });
}

export async function getFilePermissionsForUserService(
  userId: string,
  serviceId: string
) {
  return prisma.userFilePermission.findMany({
    where: { userId, serviceId },
  });
}

export async function canViewFile(
  userId: string,
  serviceId: string,
  filename: string
): Promise<boolean> {
  const rules = await prisma.userFilePermission.findMany({
    where: { userId, serviceId },
  });

  // Sin reglas: no restringimos a nivel archivo
  if (rules.length === 0) return true;

  const rule = rules.find((r) => r.filename === filename);
  return !!rule && rule.canView;
}

/**
 * Igual que arriba pero para descarga.
 */
export async function canDownloadFile(
  userId: string,
  serviceId: string,
  filename: string
): Promise<boolean> {
  const rules = await prisma.userFilePermission.findMany({
    where: { userId, serviceId },
  });

  if (rules.length === 0) return true;

  const rule = rules.find((r) => r.filename === filename);
  return !!rule && rule.canDownload;
}

export async function canUploadService(
  userId: string,
  providerId: string,
  serviceId: string
) {
  
  const prov = await prisma.userServicePermission.findFirst({
    where: { userId, providerId, canUpload: true, serviceId: null },
  });
  if (prov) return true;

  const svc = await prisma.userServicePermission.findFirst({
    where: { userId, serviceId, canUpload: true },
  });

  return !!svc;
}
