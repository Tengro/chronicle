/**
 * Record CRUD routes
 */

import { Router } from 'express';
import type { JsStore, RecordListParams, CreateRecordBody, RecordResponse } from '../types.js';

export function createRecordRoutes(store: JsStore): Router {
  const router = Router();

  // Helper to convert JsRecord to RecordResponse
  function toRecordResponse(record: ReturnType<typeof store.getRecord>): RecordResponse | null {
    if (!record) return null;

    // Try to parse payload as JSON, fall back to base64
    let payload: unknown;
    try {
      payload = JSON.parse(record.payload.toString('utf8'));
    } catch {
      payload = record.payload.toString('base64');
    }

    return {
      id: record.id,
      sequence: record.sequence,
      recordType: record.recordType,
      payload,
      timestamp: record.timestamp,
      causedBy: record.causedBy,
      linkedTo: record.linkedTo,
    };
  }

  // GET / - List/query records
  router.get('/', (req, res) => {
    try {
      const params: RecordListParams & { reverse?: boolean } = {
        type: req.query.type as string | undefined,
        from: req.query.from ? parseInt(req.query.from as string, 10) : undefined,
        to: req.query.to ? parseInt(req.query.to as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        reverse: req.query.reverse === 'true',
      };

      // Build query filter
      const filter: {
        types?: string[];
        fromSequence?: number;
        toSequence?: number;
        limit?: number;
        offset?: number;
        reverse?: boolean;
      } = {};

      if (params.type) {
        filter.types = [params.type];
      }
      if (params.from !== undefined) {
        filter.fromSequence = params.from;
      }
      if (params.to !== undefined) {
        filter.toSequence = params.to;
      }
      if (params.limit !== undefined) {
        filter.limit = params.limit;
      }
      if (params.offset !== undefined) {
        filter.offset = params.offset;
      }
      if (params.reverse) {
        filter.reverse = params.reverse;
      }

      const records = store.query(filter);
      const items = records.map(r => toRecordResponse(r)).filter((r): r is RecordResponse => r !== null);

      res.json({
        success: true,
        data: {
          items,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
          hasMore: items.length === (params.limit ?? 100),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /tail - Get most recent records (newest first)
  // Uses efficient O(log n + k) reverse range query via BTreeMap index
  router.get('/tail', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const type = req.query.type as string | undefined;

      const stats = store.stats();
      const totalCount = stats.recordCount;

      // Use reverse query to efficiently get newest records first
      const filter: {
        types?: string[];
        limit?: number;
        reverse?: boolean;
      } = {
        limit,
        reverse: true,  // Get newest first via BTreeMap reverse iteration
      };

      if (type) {
        filter.types = [type];
      }

      const records = store.query(filter);
      const items = records.map(r => toRecordResponse(r)).filter((r): r is RecordResponse => r !== null);

      res.json({
        success: true,
        data: {
          items,
          total: totalCount,
          hasMore: totalCount > limit,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /types - List all record types
  router.get('/types', (_req, res) => {
    try {
      const records = store.query({ limit: 10000 });
      const types = [...new Set(records.map(r => r.recordType))].sort();

      res.json({
        success: true,
        data: types,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /:id - Get record by ID
  router.get('/:id', (req, res) => {
    try {
      const record = store.getRecord(req.params.id);
      if (!record) {
        res.status(404).json({
          success: false,
          error: 'Record not found',
        });
        return;
      }

      res.json({
        success: true,
        data: toRecordResponse(record),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST / - Create new record
  router.post('/', (req, res) => {
    try {
      const body = req.body as CreateRecordBody;

      if (!body.type || typeof body.type !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Record type is required',
        });
        return;
      }

      let record;
      if (body.causedBy || body.linkedTo) {
        record = store.appendJsonWithLinks(body.type, body.payload, {
          causedBy: body.causedBy,
          linkedTo: body.linkedTo,
        });
      } else {
        record = store.appendJson(body.type, body.payload);
      }

      res.status(201).json({
        success: true,
        data: toRecordResponse(record),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /:id/effects - Get records caused by this record
  router.get('/:id/effects', (req, res) => {
    try {
      const effects = store.getEffects(req.params.id);
      res.json({
        success: true,
        data: effects,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /:id/links - Get records that link to this record
  router.get('/:id/links', (req, res) => {
    try {
      const links = store.getLinksTo(req.params.id);
      res.json({
        success: true,
        data: links,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
