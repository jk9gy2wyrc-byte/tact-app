import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import app from './src/api/index';

const port = Number(process.env.PORT ?? 3000);

const server = new Hono();

// API
server.route('/', app);

// Static + SPA fallback
server.use('/*', serveStatic({ root: './dist' }));
server.get('/*', serveStatic({ path: './dist/index.html' }));

export default {
  port,
  fetch: server.fetch,
};
