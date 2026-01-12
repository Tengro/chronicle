/**
 * Types for Chronicle UI Server
 */

import type { JsStore, JsRecord, JsBranch, JsStoreStats, JsStateInfo } from '../../index.js';

// Re-export store types
export type { JsStore, JsRecord, JsBranch, JsStoreStats, JsStateInfo };

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Record Types
// ============================================================================

export interface RecordListParams {
  type?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface CreateRecordBody {
  type: string;
  payload: unknown;
  causedBy?: string[];
  linkedTo?: string[];
}

export interface RecordResponse {
  id: string;
  sequence: number;
  recordType: string;
  payload: unknown;
  timestamp: number;
  causedBy: string[];
  linkedTo: string[];
}

// ============================================================================
// Branch Types
// ============================================================================

export interface CreateBranchBody {
  name: string;
  from?: string;
}

export interface SwitchBranchBody {
  name: string;
}

export interface BranchResponse {
  id: string;
  name: string;
  head: number;
  parentId?: string;
  branchPoint?: number;
  created: number;
  isCurrent: boolean;
}

// ============================================================================
// State Types
// ============================================================================

export interface StateResponse {
  id: string;
  strategy: string;
  itemCount?: number;
  opsSinceSnapshot: number;
  value?: unknown;
}

export interface StateSliceParams {
  offset?: number;
  limit?: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export interface WsSubscribeMessage {
  type: 'subscribe';
  config?: {
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
    };
  };
}

export interface WsUnsubscribeMessage {
  type: 'unsubscribe';
}

export interface WsPingMessage {
  type: 'ping';
}

export type WsClientMessage = WsSubscribeMessage | WsUnsubscribeMessage | WsPingMessage;

export interface WsEventMessage {
  type: 'event';
  event: {
    eventType: string;
    data: unknown;
  };
}

export interface WsSubscribedMessage {
  type: 'subscribed';
  id: string;
}

export interface WsErrorMessage {
  type: 'error';
  message: string;
}

export interface WsPongMessage {
  type: 'pong';
}

export type WsServerMessage = WsEventMessage | WsSubscribedMessage | WsErrorMessage | WsPongMessage;

// ============================================================================
// Middleware Options
// ============================================================================

export interface ChronicleUIOptions {
  /** Base path for API routes (default: '/api') */
  apiPath?: string;
  /** Enable CORS headers (default: true) */
  cors?: boolean;
  /** Enable request logging (default: false) */
  logging?: boolean;
}
