import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import app, { runExpiryNotifications } from './src/api/index';

// ─── Daily expiry notifications cron (runs every 24h) ─────────────────────────
// Delay first run 60s after boot, then repeat every 24h
setTimeout(async () => {
  console.log('[cron] Running daily expiry notifications...');
  const result = await runExpiryNotifications().catch(e => ({ sent: 0, failed: 0, error: String(e) }));
  console.log('[cron] Expiry notifications done:', result);
  setInterval(async () => {
    console.log('[cron] Running daily expiry notifications...');
    const r = await runExpiryNotifications().catch(e => ({ sent: 0, failed: 0, error: String(e) }));
    console.log('[cron] Expiry notifications done:', r);
  }, 24 * 60 * 60 * 1000);
}, 60_000);

const port = Number(process.env.PORT ?? 3001);
const distDir = resolve(import.meta.dir, './dist');

const server = new Hono();

// API
server.route('/', app);

// Static files
server.use('/*', serveStatic({ root: distDir }));

// SPA fallback — all unmatched routes serve index.html
server.get('*', async (c) => {
  const html = await Bun.file(resolve(distDir, 'index.html')).text();
  return c.html(html);
});

export default {
  port,
  fetch: server.fetch,
};
