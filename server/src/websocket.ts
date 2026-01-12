/**
 * WebSocket handler for Chronicle subscriptions
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { JsStore, WsClientMessage, WsServerMessage, WsSubscribeMessage } from './types.js';

interface ClientState {
  subscriptionId: string | null;
  pollInterval: ReturnType<typeof setInterval> | null;
}

type SubscriptionConfig = WsSubscribeMessage['config'];

const clientStates = new WeakMap<WebSocket, ClientState>();

function getClientState(ws: WebSocket): ClientState {
  let state = clientStates.get(ws);
  if (!state) {
    state = { subscriptionId: null, pollInterval: null };
    clientStates.set(ws, state);
  }
  return state;
}

function send(ws: WebSocket, message: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function cleanup(ws: WebSocket, store: JsStore): void {
  const state = getClientState(ws);

  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }

  if (state.subscriptionId) {
    try {
      store.unsubscribe(state.subscriptionId);
    } catch {
      // Ignore errors during cleanup
    }
    state.subscriptionId = null;
  }
}

function handleSubscribe(
  ws: WebSocket,
  store: JsStore,
  config?: SubscriptionConfig
): void {
  const state = getClientState(ws);
  console.log('[WS] Subscribe request, config:', JSON.stringify(config));

  // Cleanup existing subscription
  if (state.subscriptionId) {
    cleanup(ws, store);
  }

  try {
    // Create subscription - convert config to store format
    const storeConfig = config ? {
      bufferSize: config.bufferSize,
      maxSnapshotBytes: config.maxSnapshotBytes,
      fromSequence: config.fromSequence,
      filter: config.filter,
    } : undefined;
    console.log('[WS] Creating subscription with config:', JSON.stringify(storeConfig));
    const subscriptionId = store.subscribe(storeConfig);
    state.subscriptionId = subscriptionId;
    console.log('[WS] Subscription created:', subscriptionId);

    // Always perform catch-up to mark subscription as ready for live events
    // (even without fromSequence, this marks the subscription as caught up)
    store.catchUpSubscription(subscriptionId);
    console.log('[WS] Subscription caught up');

    send(ws, { type: 'subscribed', id: subscriptionId });

    // Start polling for events
    let pollCount = 0;
    state.pollInterval = setInterval(() => {
      if (!state.subscriptionId) return;

      try {
        let event = store.pollSubscription(state.subscriptionId);
        while (event) {
          console.log('[WS] Event polled:', event.eventType);
          send(ws, {
            type: 'event',
            event: {
              eventType: event.eventType,
              data: JSON.parse(event.data),
            },
          });
          event = store.pollSubscription(state.subscriptionId);
        }
        // Log every 100 polls (5 seconds) to show polling is active
        pollCount++;
        if (pollCount % 100 === 0) {
          console.log('[WS] Poll check #', pollCount, 'for subscription', state.subscriptionId);
        }
      } catch (error) {
        // Subscription may have been dropped
        console.log('[WS] Poll error:', error);
        send(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Subscription error',
        });
        cleanup(ws, store);
      }
    }, 50); // Poll every 50ms
  } catch (error) {
    console.log('[WS] Subscribe error:', error);
    send(ws, {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to subscribe',
    });
  }
}

function handleMessage(ws: WebSocket, store: JsStore, data: string): void {
  let message: WsClientMessage;
  try {
    message = JSON.parse(data) as WsClientMessage;
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(ws, store, message.config);
      break;

    case 'unsubscribe':
      cleanup(ws, store);
      break;

    case 'ping':
      send(ws, { type: 'pong' });
      break;

    default:
      send(ws, { type: 'error', message: `Unknown message type: ${(message as { type: string }).type}` });
  }
}

/**
 * Create a WebSocket server for Chronicle subscriptions.
 * Attaches to an existing HTTP server.
 */
export function createWebSocketHandler(store: JsStore): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[WS] Client connected');

    ws.on('message', (data) => {
      console.log('[WS] Message received:', data.toString().slice(0, 200));
      handleMessage(ws, store, data.toString());
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      cleanup(ws, store);
    });

    ws.on('error', (err) => {
      console.log('[WS] Error:', err);
      cleanup(ws, store);
    });
  });

  return wss;
}

/**
 * Handle WebSocket upgrade request.
 */
export function handleUpgrade(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}
