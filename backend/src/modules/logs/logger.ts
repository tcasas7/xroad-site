import { prisma } from '../../db/prisma';

export async function logAction(userId: string, action: string, detail?: string) {
  try {
    await prisma.actionLog.create({
      data: {
        userId,
        action,
        detail: detail || "",
      },
    });
  } catch (err) {
    console.error("❌ Error guardando log:", err);
  }
}
