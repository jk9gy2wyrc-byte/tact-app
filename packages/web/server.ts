import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { resolve } from 'path';
import app from './src/api/index';

const port = Number(process.env.PORT ?? 3001);
const distDir = resolve(import.meta.dir, './dist');

const server = new Hono();

// API
server.route('/', app);

// Static + SPA fallback
server.use('/*', serveStatic({ root: distDir }));
server.get('/*', serveStatic({ path: resolve(distDir, 'index.html') }));

export default {
  port,
  fetch: server.fetch,
};
