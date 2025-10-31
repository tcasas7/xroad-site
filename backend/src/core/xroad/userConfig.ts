// src/core/xroad/userConfig.ts
import { prisma } from "../../db/prisma";

export async function getUserXRoadConfig(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("user_not_found");

  const baseUrl = (user.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("user_missing_baseUrl");

  const { xRoadInstance, xRoadMemberClass, xRoadMemberCode, xRoadSubsystem } = user;
  if (!xRoadInstance || !xRoadMemberClass || !xRoadMemberCode || !xRoadSubsystem) {
    throw new Error("user_missing_xroad_client");
  }

  const xRoadClient = `${xRoadInstance}/${xRoadMemberClass}/${xRoadMemberCode}/${xRoadSubsystem}`;
  return { baseUrl, xRoadClient, xRoadInstance, xRoadMemberClass, xRoadMemberCode, xRoadSubsystem };
}
