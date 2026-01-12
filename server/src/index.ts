/**
 * Chronicle UI Server - Embedded middleware for inspecting Chronicle stores
 *
 * Usage:
 * ```typescript
 * import express from 'express';
 * import { JsStore } from 'chronicle';
 * import { createChronicleUI } from 'chronicle/server';
 *
 * const app = express();
 * const store = JsStore.openOrCreate({ path: './data' });
 *
 * // Mount Chronicle UI at /chronicle
 * const { router, wss } = createChronicleUI(store);
 * app.use('/chronicle', router);
 *
 * const server = app.listen(3000);
 *
 * // Handle WebSocket upgrades
 * server.on('upgrade', (request, socket, head) => {
 *   if (request.url?.startsWith('/chronicle/ws')) {
 *     wss.handleUpgrade(request, socket, head, (ws) => {
 *       wss.emit('connection', ws, request);
 *     });
 *   }
 * });
 * ```
 */

import express, { Router, json } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { WebSocketServer } from 'ws';
import type { JsStore, ChronicleUIOptions } from './types.js';
import { createStoreRoutes } from './routes/store.js';
import { createBranchRoutes } from './routes/branches.js';
import { createRecordRoutes } from './routes/records.js';
import { createStateRoutes } from './routes/states.js';
import { createWebSocketHandler } from './websocket.js';

export * from './types.js';
export { createWebSocketHandler, handleUpgrade } from './websocket.js';

/**
 * Create Chronicle UI middleware.
 *
 * Returns an Express router and WebSocket server that can be mounted
 * on your application.
 */
export function createChronicleUI(
  store: JsStore,
  options: ChronicleUIOptions = {}
): { router: Router; wss: WebSocketServer } {
  const { apiPath = '/api', cors = true, logging = false } = options;

  const router = Router();

  // CORS headers
  if (cors) {
    router.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    router.options('*', (_req, res) => {
      res.sendStatus(200);
    });
  }

  // Request logging
  if (logging) {
    router.use((req, _res, next) => {
      console.log(`[Chronicle UI] ${req.method} ${req.path}`);
      next();
    });
  }

  // JSON body parsing for API routes
  router.use(apiPath, json());

  // Mount API routes
  router.use(`${apiPath}/store`, createStoreRoutes(store));
  router.use(`${apiPath}/branches`, createBranchRoutes(store));
  router.use(`${apiPath}/records`, createRecordRoutes(store));
  router.use(`${apiPath}/states`, createStateRoutes(store));

  // Serve static UI files (if built)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const staticPath = join(__dirname, 'static');

  if (existsSync(staticPath)) {
    router.use(express.static(staticPath));

    // SPA fallback - serve index.html for all non-API routes
    router.get('*', (req, res, next) => {
      if (req.path.startsWith(apiPath)) {
        next();
        return;
      }
      res.sendFile(join(staticPath, 'index.html'));
    });
  } else {
    // No UI built yet - show placeholder
    router.get('/', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Chronicle UI</title>
          <style>
            body { font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto; }
            code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
            pre { background: #f0f0f0; padding: 1rem; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>Chronicle UI</h1>
          <p>The UI has not been built yet. API endpoints are available:</p>
          <ul>
            <li><code>GET ${apiPath}/store/stats</code> - Store statistics</li>
            <li><code>GET ${apiPath}/branches</code> - List branches</li>
            <li><code>GET ${apiPath}/records</code> - Query records</li>
            <li><code>GET ${apiPath}/states</code> - List states</li>
          </ul>
          <p>WebSocket available at <code>/ws</code></p>
        </body>
        </html>
      `);
    });
  }

  // Create WebSocket handler
  const wss = createWebSocketHandler(store);

  return { router, wss };
}

// Default export for convenience
export default createChronicleUI;
