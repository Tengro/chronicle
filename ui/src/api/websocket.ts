/**
 * WebSocket connection for Chronicle live subscriptions
 */

import { ref, readonly, onUnmounted } from 'vue';

// ============================================================================
// Types
// ============================================================================

export interface SubscriptionConfig {
  bufferSize?: number;
  maxSnapshotBytes?: number;
  fromSequence?: number;
  filter?: {
    recordTypes?: string[];
    branch?: string;
    stateIds?: string[];
    includeRecords?: boolean;
    includeStateChanges?: boolean;
    includeBranchEvents?: boolean;
    includeStoreEvents?: boolean;
  };
}

export interface StoreEvent {
  eventType: string;
  data: unknown;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// WebSocket Manager
// ============================================================================

// Construct WebSocket URL relative to current location (works when mounted at any base path)
function getWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Get the base path from current location, append /ws
  const basePath = window.location.pathname.replace(/\/$/, '');
  return `${protocol}//${window.location.host}${basePath}/ws`;
}

const WS_URL = getWebSocketUrl();

export function useChronicleWebSocket() {
  const status = ref<ConnectionStatus>('disconnected');
  const subscriptionId = ref<string | null>(null);
  const error = ref<string | null>(null);
  const events = ref<StoreEvent[]>([]);

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const eventHandlers = new Set<(event: StoreEvent) => void>();
  let pendingSubscription: SubscriptionConfig | null = null;

  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    status.value = 'connecting';
    error.value = null;

    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        status.value = 'connected';
        error.value = null;
        console.log('[WS Client] Connected');

        // Send pending subscription if any
        if (pendingSubscription !== null) {
          console.log('[WS Client] Sending pending subscription');
          ws!.send(JSON.stringify({
            type: 'subscribe',
            config: pendingSubscription,
          }));
          pendingSubscription = null;
        }

        // Start ping interval
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'subscribed':
              subscriptionId.value = message.id;
              break;

            case 'event':
              events.value.push(message.event);
              // Keep last 1000 events
              if (events.value.length > 1000) {
                events.value = events.value.slice(-1000);
              }
              // Notify handlers
              eventHandlers.forEach((handler) => handler(message.event));
              break;

            case 'error':
              error.value = message.message;
              break;

            case 'pong':
              // Heartbeat acknowledged
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        status.value = 'disconnected';
        subscriptionId.value = null;
        cleanup();

        // Attempt reconnection after 3 seconds
        reconnectTimeout = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        status.value = 'error';
        error.value = 'WebSocket connection error';
      };
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : 'Failed to connect';
    }
  }

  function cleanup() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    cleanup();

    if (ws) {
      ws.close();
      ws = null;
    }

    status.value = 'disconnected';
    subscriptionId.value = null;
  }

  function subscribe(config?: SubscriptionConfig) {
    console.log('[WS Client] Subscribe called, readyState:', ws?.readyState);

    if (ws?.readyState === WebSocket.OPEN) {
      // Already connected, send immediately
      console.log('[WS Client] Sending subscribe immediately');
      ws.send(JSON.stringify({
        type: 'subscribe',
        config,
      }));
    } else if (ws?.readyState === WebSocket.CONNECTING) {
      // Connection in progress, queue the subscription
      console.log('[WS Client] Queuing subscription (connecting)');
      pendingSubscription = config ?? {};
    } else {
      // Not connected, queue and connect
      console.log('[WS Client] Queuing subscription and connecting');
      pendingSubscription = config ?? {};
      connect();
    }
  }

  function unsubscribe() {
    if (ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify({ type: 'unsubscribe' }));
    subscriptionId.value = null;
  }

  function onEvent(handler: (event: StoreEvent) => void) {
    eventHandlers.add(handler);
    return () => eventHandlers.delete(handler);
  }

  function clearEvents() {
    events.value = [];
  }

  // Auto-cleanup on unmount
  onUnmounted(() => {
    disconnect();
  });

  return {
    status: readonly(status),
    subscriptionId: readonly(subscriptionId),
    error: readonly(error),
    events: readonly(events),
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    onEvent,
    clearEvents,
  };
}
