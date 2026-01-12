/**
 * Branch management routes
 */

import { Router } from 'express';
import type { JsStore, BranchResponse, CreateBranchBody, SwitchBranchBody } from '../types.js';

export function createBranchRoutes(store: JsStore): Router {
  const router = Router();

  // Helper to convert JsBranch to BranchResponse
  function toBranchResponse(branch: ReturnType<typeof store.currentBranch>, isCurrent: boolean): BranchResponse {
    return {
      id: branch.id,
      name: branch.name,
      head: branch.head,
      parentId: branch.parentId ?? undefined,
      branchPoint: branch.branchPoint ?? undefined,
      created: branch.created,
      isCurrent,
    };
  }

  // GET / - List all branches
  router.get('/', (_req, res) => {
    try {
      const branches = store.listBranches();
      const currentBranch = store.currentBranch();

      res.json({
        success: true,
        data: branches.map(b => toBranchResponse(b, b.id === currentBranch.id)),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /current - Get current branch
  router.get('/current', (_req, res) => {
    try {
      const branch = store.currentBranch();
      res.json({
        success: true,
        data: toBranchResponse(branch, true),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST / - Create new branch
  router.post('/', (req, res) => {
    try {
      const body = req.body as CreateBranchBody;

      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Branch name is required',
        });
        return;
      }

      const branch = store.createBranch(body.name, body.from ?? null);
      res.status(201).json({
        success: true,
        data: toBranchResponse(branch, false),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('already exists') ? 409 : 500;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  // PUT /current - Switch to a branch
  router.put('/current', (req, res) => {
    try {
      const body = req.body as SwitchBranchBody;

      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Branch name is required',
        });
        return;
      }

      const branch = store.switchBranch(body.name);
      res.json({
        success: true,
        data: toBranchResponse(branch, true),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  // DELETE /:name - Delete a branch
  router.delete('/:name', (req, res) => {
    try {
      store.deleteBranch(req.params.name);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('not found') || message.includes('Cannot delete') ? 400 : 500;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  return router;
}
