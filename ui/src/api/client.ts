/**
 * Chronicle API Client
 */

// Base URL - use relative path so it works when mounted at any base path
const BASE_URL = import.meta.env.VITE_API_URL || './api';

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  offset: number;
  limit: number;
  hasMore: boolean;
  total?: number;
}

export interface StoreStats {
  recordCount: number;
  blobCount: number;
  branchCount: number;
  stateSlotCount: number;
  totalSizeBytes: number;
  blobSizeBytes: number;
}

export interface Branch {
  id: string;
  name: string;
  head: number;
  parentId?: string;
  branchPoint?: number;
  created: number;
  isCurrent: boolean;
}

export interface Record {
  id: string;
  sequence: number;
  recordType: string;
  payload: unknown;
  timestamp: number;
  causedBy: string[];
  linkedTo: string[];
}

export interface StateInfo {
  id: string;
  strategy: string;
  itemCount?: number;
  opsSinceSnapshot: number;
  value?: unknown;
}

// ============================================================================
// HTTP Client
// ============================================================================

class ChronicleClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const result: ApiResponse<T> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    return result.data as T;
  }

  // Store
  async getStats(): Promise<StoreStats> {
    return this.request<StoreStats>('GET', '/store/stats');
  }

  async sync(): Promise<void> {
    await this.request('POST', '/store/sync');
  }

  async getBlob(hash: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/store/blobs/${hash}`);
    return response.blob();
  }

  // Branches
  async listBranches(): Promise<Branch[]> {
    return this.request<Branch[]>('GET', '/branches');
  }

  async getCurrentBranch(): Promise<Branch> {
    return this.request<Branch>('GET', '/branches/current');
  }

  async createBranch(name: string, from?: string): Promise<Branch> {
    return this.request<Branch>('POST', '/branches', { name, from });
  }

  async switchBranch(name: string): Promise<Branch> {
    return this.request<Branch>('PUT', '/branches/current', { name });
  }

  async deleteBranch(name: string): Promise<void> {
    await this.request('DELETE', `/branches/${encodeURIComponent(name)}`);
  }

  // Records
  async listRecords(params: {
    type?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
    reverse?: boolean;
  } = {}): Promise<PaginatedResponse<Record>> {
    const searchParams = new URLSearchParams();
    if (params.type) searchParams.set('type', params.type);
    if (params.from !== undefined) searchParams.set('from', String(params.from));
    if (params.to !== undefined) searchParams.set('to', String(params.to));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params.reverse) searchParams.set('reverse', 'true');

    const query = searchParams.toString();
    return this.request<PaginatedResponse<Record>>('GET', `/records${query ? `?${query}` : ''}`);
  }

  async getRecordTypes(): Promise<string[]> {
    return this.request<string[]>('GET', '/records/types');
  }

  async getRecordsTail(params: {
    limit?: number;
    type?: string;
  } = {}): Promise<{ items: Record[]; total: number; hasMore: boolean }> {
    const searchParams = new URLSearchParams();
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.type) searchParams.set('type', params.type);
    const query = searchParams.toString();
    return this.request('GET', `/records/tail${query ? `?${query}` : ''}`);
  }

  async getRecord(id: string): Promise<Record> {
    return this.request<Record>('GET', `/records/${encodeURIComponent(id)}`);
  }

  async createRecord(
    type: string,
    payload: unknown,
    causedBy?: string[],
    linkedTo?: string[]
  ): Promise<Record> {
    return this.request<Record>('POST', '/records', {
      type,
      payload,
      causedBy,
      linkedTo,
    });
  }

  async getRecordEffects(id: string): Promise<string[]> {
    return this.request<string[]>('GET', `/records/${encodeURIComponent(id)}/effects`);
  }

  async getRecordLinks(id: string): Promise<string[]> {
    return this.request<string[]>('GET', `/records/${encodeURIComponent(id)}/links`);
  }

  // States
  async listStates(): Promise<StateInfo[]> {
    return this.request<StateInfo[]>('GET', '/states');
  }

  async getState(id: string): Promise<StateInfo> {
    return this.request<StateInfo>('GET', `/states/${encodeURIComponent(id)}`);
  }

  async getStateAt(id: string, sequence: number): Promise<{ id: string; sequence: number; value: unknown }> {
    return this.request('GET', `/states/${encodeURIComponent(id)}/at/${sequence}`);
  }

  async getStateSlice(id: string, offset = 0, limit = 100): Promise<PaginatedResponse<unknown>> {
    return this.request<PaginatedResponse<unknown>>(
      'GET',
      `/states/${encodeURIComponent(id)}/slice?offset=${offset}&limit=${limit}`
    );
  }

  async getStateTail(id: string, count = 10): Promise<{ items: unknown[]; count: number; total: number | null }> {
    return this.request('GET', `/states/${encodeURIComponent(id)}/tail?count=${count}`);
  }

  async getStateLength(id: string): Promise<{ length: number }> {
    return this.request('GET', `/states/${encodeURIComponent(id)}/length`);
  }

  async searchState(
    id: string,
    query: string,
    options: { limit?: number; field?: string } = {}
  ): Promise<{ items: { index: number; item: unknown }[]; total: number; query: string; field: string | null }> {
    const params = new URLSearchParams({ q: query });
    if (options.limit) params.set('limit', String(options.limit));
    if (options.field) params.set('field', options.field);
    return this.request('GET', `/states/${encodeURIComponent(id)}/search?${params}`);
  }
}

// Export singleton instance
export const client = new ChronicleClient();

// Export class for custom instances
export { ChronicleClient };
