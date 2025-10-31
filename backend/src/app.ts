// src/app.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { router as authRouter } from './modules/auth/router';
import { router as profileRouter } from './modules/profile/router';
import { router as providerRouter } from './modules/providers/router';
import { router as proxyRouter } from './modules/proxy/router';
import { xroadRouter } from './modules/xroad/router';
import { adminRouter } from './modules/admin/router';
import { requireAdmin } from "./middlewares/isAdmin";
import { requireAuth } from './middlewares/auth';



const app = express();
app.use(cookieParser());
// ⚙️ Configuración CORS segura para desarrollo
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));

// 🧩 Parseo antes de todo

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔐 auth & profile
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);

// 🔎 discovery / invoke (por usuario)
app.use('/api/providers', providerRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/xroad', xroadRouter);
app.use("/api/admin", requireAuth, requireAdmin, adminRouter);
// ✅ Startup
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
});

export default app;
