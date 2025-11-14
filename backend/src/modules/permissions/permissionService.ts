// src/modules/permissions/permissionService.ts
import { prisma } from "../../db/prisma";

/** ----------------------------------------------
 *  PROVIDER PERMISSIONS
 * ---------------------------------------------- */
export async function canViewProvider(userId: string, providerId: string) {
  const perm = await prisma.userServicePermission.findFirst({
    where: { userId, providerId, canView: true }
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
  // 1) Global permission
  const base = await prisma.userPermissions.findUnique({
    where: { userId },
  });

  if (base?.canViewServices) return true;

  // 2) Direct permission over serviceId
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
  const perm = await prisma.userServicePermission.findFirst({
    where: {
      userId,
      serviceId,
      canDownload: true,
    },
  });

  return !!perm;
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
