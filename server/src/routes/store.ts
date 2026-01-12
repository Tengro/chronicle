/**
 * Store-level routes: stats, sync, blobs
 */

import { Router } from 'express';
import type { JsStore } from '../types.js';

export function createStoreRoutes(store: JsStore): Router {
  const router = Router();

  // GET /stats - Get store statistics
  router.get('/stats', (_req, res) => {
    try {
      const stats = store.stats();
      res.json({
        success: true,
        data: {
          recordCount: stats.recordCount,
          blobCount: stats.blobCount,
          branchCount: stats.branchCount,
          stateSlotCount: stats.stateSlotCount,
          totalSizeBytes: stats.totalSizeBytes,
          blobSizeBytes: stats.blobSizeBytes,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /sync - Sync writes to disk
  router.post('/sync', (_req, res) => {
    try {
      store.sync();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /blobs/:hash - Get blob by hash
  router.get('/blobs/:hash', (req, res) => {
    try {
      const blob = store.getBlob(req.params.hash);
      if (blob === null) {
        res.status(404).json({
          success: false,
          error: 'Blob not found',
        });
        return;
      }
      // Send as binary with appropriate content type
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(blob);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
