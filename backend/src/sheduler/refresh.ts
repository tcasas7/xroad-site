
import { refreshProviders } from '../core/xroad/discovery';

let running = false;

export function startProviderAutoRefresh(intervalMs = 5 * 60 * 1000) {
  console.log(`🔄 Scheduler de providers activo (cada ${intervalMs / 1000}s)`);

  setInterval(async () => {
    if (running) return; // evita doble ejecución si tarda
    running = true;

    try {
      const result = await refreshProviders();
      console.log(`✅ Auto-refresh OK | discovered=${result.discovered} | withServices=${result.withServices}`);
    } catch (err: any) {
      console.warn(`⚠ Auto-refresh falló: ${String(err?.message || err)}`);
    }

    running = false;
  }, intervalMs);
}
