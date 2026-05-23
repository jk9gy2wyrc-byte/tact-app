import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import app from './src/api/index';

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
