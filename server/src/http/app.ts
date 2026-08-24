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
import { ApprovalService, SignalActionError } from '../domain/approval-service.js';
import { HealthService } from '../domain/health-service.js';
import type { ReplayController } from '../replay/controller.js';
import { replayFixtureNames } from '../replay/fixture-source.js';
import { errorHandler, HttpError, notFoundHandler } from './errors.js';
import { z } from 'zod';

export function createApp(
  healthService = new HealthService(),
  approvalService = new ApprovalService(),
  replayController?: ReplayController,
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
          message: 'Approval passed current policy. Order execution is deferred to Phase 5.',
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

  if (replayController && env.NODE_ENV !== 'production') {
    const StartReplaySchema = z
      .object({
        fixture: z.enum(replayFixtureNames).default('btc-trigger'),
        speed: z.number().finite().nonnegative().default(env.REPLAY_SPEED),
        stepOnly: z.boolean().default(false),
      })
      .strict();

    app.post('/dev/replay/start', async (request, response, next) => {
      try {
        response.json(await replayController.start(StartReplaySchema.parse(request.body ?? {})));
      } catch (error: unknown) {
        next(
          new HttpError(
            409,
            'REPLAY_START_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    });

    app.post('/dev/replay/step', async (_request, response, next) => {
      try {
        response.json(await replayController.step());
      } catch (error: unknown) {
        next(
          new HttpError(
            409,
            'REPLAY_STEP_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    });

    app.post('/dev/replay/reset', async (_request, response, next) => {
      try {
        response.json(await replayController.reset());
      } catch (error: unknown) {
        next(
          new HttpError(
            409,
            'REPLAY_RESET_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    });

    app.get('/dev/replay/status', (_request, response) => {
      response.json(replayController.status());
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function toHttpError(error: unknown): unknown {
  if (!(error instanceof SignalActionError)) return error;
  const status = error.code.endsWith('NOT_FOUND') ? 404 : 409;
  return new HttpError(status, error.code, error.message, {
    ...(error.field ? { field: error.field } : {}),
    ...(error.risk ? { risk: error.risk } : {}),
  });
}
