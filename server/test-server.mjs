/**
 * Quick test script for Chronicle UI server
 */

import express from 'express';
import { createChronicleUI } from './dist/index.js';
import { JsStore } from '../index.js';
import { rmSync } from 'fs';

// Use relative path like the existing test
const storePath = './test-ui-store';

// Clean up any existing test store
try { rmSync(storePath, { recursive: true }); } catch {}

console.log('Test dir:', storePath);

// Create store
const store = JsStore.openOrCreate({ path: storePath });

// Add some test data
store.appendJson('message', { text: 'Hello' });
store.appendJson('message', { text: 'World' });
store.appendJson('event', { type: 'click' });
store.createBranch('feature-1');

// Register an append_log state for streaming logs
store.registerState({
  id: 'system-logs',
  strategy: 'append_log',
  deltaSnapshotEvery: 50,
  fullSnapshotEvery: 500,
});

// Add some initial log entries
const logTypes = ['INFO', 'DEBUG', 'WARN', 'ERROR'];
const logSources = ['api', 'db', 'auth', 'cache', 'worker'];
const logMessages = [
  'Request processed successfully',
  'Cache hit for key',
  'Database query executed',
  'User authenticated',
  'Background job started',
  'Connection established',
  'Retry attempt',
  'Rate limit checked',
  'Session validated',
  'Config loaded',
];

function generateLogEntry() {
  const type = logTypes[Math.floor(Math.random() * logTypes.length)];
  const source = logSources[Math.floor(Math.random() * logSources.length)];
  const message = logMessages[Math.floor(Math.random() * logMessages.length)];
  return {
    timestamp: Date.now(),
    type,
    source,
    message: `[${source}] ${message}`,
    requestId: Math.random().toString(36).substring(2, 10),
  };
}

// Add initial log history
for (let i = 0; i < 50; i++) {
  store.appendToStateJson('system-logs', generateLogEntry());
}

console.log('Store stats:', store.stats());

// Stream new log entries periodically
let logInterval;
let logCount = 0;
function startLogStreaming() {
  logInterval = setInterval(() => {
    try {
      const entry = generateLogEntry();
      store.appendToStateJson('system-logs', entry);
      logCount++;
      console.log(`[LOG ${logCount}] Appended: ${entry.type} - ${entry.message}`);
    } catch (e) {
      // Store might be closed
      clearInterval(logInterval);
    }
  }, 2000); // New log every 2 seconds
}

startLogStreaming();
console.log('Log streaming started (new entry every 2s)');

// Create Express app
const app = express();

// Mount Chronicle UI
const { router, wss } = createChronicleUI(store, { logging: true });
app.use('/chronicle', router);

// Start server
const server = app.listen(3001, () => {
  console.log('Chronicle UI available at http://localhost:3001/chronicle');
  console.log('API endpoints:');
  console.log('  GET http://localhost:3001/chronicle/api/store/stats');
  console.log('  GET http://localhost:3001/chronicle/api/branches');
  console.log('  GET http://localhost:3001/chronicle/api/records');
  console.log('');
  console.log('Press Ctrl+C to stop');
});

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/chronicle/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  clearInterval(logInterval);
  store.close();
  server.close();
  rmSync(storePath, { recursive: true });
  process.exit(0);
});
