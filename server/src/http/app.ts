import express from 'express';
import {
  ApprovalRequestSchema,
  MandateSchema,
  SignalActionResultSchema,
  SignalDetailSchema,
  SignalListQuerySchema,
  SignalListResponseSchema,
  UuidSchema,
} from '@pocketpilot/shared';

import { env } from '../config/env.js';
import { getCurrentMandate } from '../db/mandate-repository.js';
import { getSignal, listSignals } from '../db/signal-repository.js';
import { ApprovalStubService, SignalActionError } from '../domain/approval-stub-service.js';
import { HealthService } from '../domain/health-service.js';
import { errorHandler, HttpError, notFoundHandler } from './errors.js';

export function createApp(
  healthService = new HealthService(),
  approvalService = new ApprovalStubService(),
): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_request, response, next) => {
    try {
      const report = await healthService.check();
      response.status(report.status === 'ok' ? 200 : 503).json({
        ...report,
        dataMode: env.DATA_MODE,
        executionMode: env.EXECUTION_MODE,
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  app.get('/config', (_request, response) => {
    response.json({
      dataMode: env.DATA_MODE,
      executionMode: env.EXECUTION_MODE,
      serverTime: new Date().toISOString(),
    });
  });

  app.get('/mandate', async (_request, response, next) => {
    try {
      const mandate = await getCurrentMandate();
      if (!mandate) throw new HttpError(404, 'MANDATE_NOT_FOUND', 'Current mandate was not found');
      response.json(MandateSchema.parse(mandate));
    } catch (error: unknown) {
      next(error);
    }
  });

  app.get('/signals', async (request, response, next) => {
    try {
      const query = SignalListQuerySchema.parse(request.query);
      response.json(SignalListResponseSchema.parse(await listSignals(query)));
    } catch (error: unknown) {
      next(error);
    }
  });

  app.get('/signals/:id', async (request, response, next) => {
    try {
      const id = UuidSchema.parse(request.params.id);
      const signal = await getSignal(id);
      if (!signal) throw new HttpError(404, 'SIGNAL_NOT_FOUND', 'Signal was not found');
      response.json(SignalDetailSchema.parse(signal));
    } catch (error: unknown) {
      next(error);
    }
  });

  app.post('/signals/:id/approve', async (request, response, next) => {
    try {
      const id = UuidSchema.parse(request.params.id);
      const approval = ApprovalRequestSchema.parse(request.body);
      const signal = await approvalService.approve(id, approval);
      response.json(
        SignalActionResultSchema.parse({
          signal,
          executionDeferred: true,
          message: 'Approval saved. Order execution arrives in Phase 5.',
        }),
      );
    } catch (error: unknown) {
      next(toHttpError(error));
    }
  });

  app.post('/signals/:id/reject', async (request, response, next) => {
    try {
      const id = UuidSchema.parse(request.params.id);
      const signal = await approvalService.reject(id);
      response.json(
        SignalActionResultSchema.parse({
          signal,
          executionDeferred: true,
          message: 'Signal rejected. No order was created.',
        }),
      );
    } catch (error: unknown) {
      next(toHttpError(error));
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof SignalActionError)) return error;
  const status = error.code.endsWith('NOT_FOUND') ? 404 : 409;
  return new HttpError(
    status,
    error.code,
    error.message,
    error.field ? { field: error.field } : {},
  );
}
