import express from 'express';

import { env } from '../config/env.js';
import { HealthService } from '../domain/health-service.js';
import { errorHandler, notFoundHandler } from './errors.js';

export function createApp(healthService = new HealthService()): express.Express {
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
