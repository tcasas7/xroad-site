import 'dotenv/config';  
import express from 'express';
import cors from 'cors';
import { router as configRouter } from './modules/config/router';
import { router as certRouter } from './modules/certificate/router';
import { router as providerRouter } from './modules/providers/router';
import { router as proxyRouter } from './modules/proxy/router';
import { startProviderAutoRefresh } from './sheduler/refresh';
import { router as invokeRouter } from "./modules/invoke/router";
import { xroadRouter } from './modules/xroad/router';


const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/config', configRouter);
app.use('/api/certificate', certRouter);
app.use('/api/providers', providerRouter);
app.use('/api/proxy', proxyRouter);
app.use("/api/invoke", invokeRouter);
app.use("/api/xroad", xroadRouter)

startProviderAutoRefresh();


const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API up on http://localhost:${PORT}`);
});

export default app;
