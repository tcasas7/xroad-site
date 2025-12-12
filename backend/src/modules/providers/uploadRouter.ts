import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middlewares/auth";
import { canUploadService, canViewService } from "../permissions/permissionService";
import { logAction } from "../logs/logger";

const uploadRouter = Router();

const uploadDir = path.join(__dirname, "../../../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });

// =============================
// POST /api/provider/upload
// =============================
uploadRouter.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = req.auth!.userId;
      const { providerId, serviceId } = req.body;

      if (!req.file) return res.status(400).json({ error: "file_required" });
      if (!providerId || !serviceId)
        return res.status(400).json({ error: "missing_provider_service" });

      const allowed = await canUploadService(userId, providerId, serviceId);
      if (!allowed) return res.status(403).json({ error: "forbidden_upload" });

      const saved = await prisma.uploadedFile.create({
        data: {
          userId,
          providerId,
          serviceId,
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.filename,
        },
      });

      await logAction(
        userId,
        "UPLOAD_FILE",
        `Subió archivo ${req.file.originalname} al servicio ${serviceId}`
      );

      return res.json({ ok: true, file: saved });
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      return res.status(500).json({ error: "upload_failed" });
    }
  }
);

// =============================
// GET /api/provider/files/:providerId/:serviceId
// =============================
uploadRouter.get(
  "/files/:providerId/:serviceId",
  requireAuth,
  async (req, res) => {
    try {
      const { providerId, serviceId } = req.params;
      const userId = req.auth!.userId;

      const allowed = await canViewService(userId, providerId, serviceId);
      if (!allowed) return res.status(403).json({ error: "forbidden" });

      const items = await prisma.uploadedFile.findMany({
        where: { providerId, serviceId },
        orderBy: { createdAt: "desc" },
      });

      return res.json({ ok: true, items });
    } catch (err) {
      console.error("FILES ERROR:", err);
      return res.status(500).json({ error: "files_fetch_failed" });
    }
  }
);

export { uploadRouter };
