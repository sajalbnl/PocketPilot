import { createServer } from 'node:http';

import { env } from './config/env.js';
import { closeDatabase } from './db/client.js';
import { AgentControlService } from './domain/agent-control-service.js';
import { ApprovalService } from './domain/approval-service.js';
import { HealthService } from './domain/health-service.js';
import { PositionService } from './domain/position-service.js';
import { createExecutionAdapter } from './execution/factory.js';
import { createApp } from './http/app.js';
import { MarketPriceService, NormalizedMarketState } from './market/price-service.js';
import { createLiveIngestionController } from './live/controller.js';
import { ExpoPushClient } from './notification/expo-client.js';
import { PostgresNotificationRepository } from './notification/repository.js';
import { NotificationService } from './notification/service.js';
import { createReasoningProvider } from './reasoning/factory.js';
import { SignalReasoningService } from './reasoning/service.js';
import { createReplayController } from './replay/runtime.js';
import { loadInvestorSkill } from './skill/loader.js';

const investorSkill = await loadInvestorSkill();
const marketState = new NormalizedMarketState();
const priceService = new MarketPriceService(marketState);
const executionAdapter = await createExecutionAdapter(priceService);
const approvalService = new ApprovalService(executionAdapter);
const positionService = new PositionService(executionAdapter);
const agentControlService = new AgentControlService();
const notificationService = new NotificationService(
  new PostgresNotificationRepository(),
  new ExpoPushClient({
    url: env.EXPO_PUSH_URL,
    accessToken: env.EXPO_ACCESS_TOKEN,
    timeoutMs: env.EXPO_PUSH_TIMEOUT_MS,
  }),
);
const reasoningService = new SignalReasoningService(createReasoningProvider(), notificationService);
const replayController =
  env.DATA_MODE === 'replay'
    ? await createReplayController(investorSkill, reasoningService, marketState)
    : undefined;
const liveController =
  env.DATA_MODE === 'live'
    ? await createLiveIngestionController(investorSkill, reasoningService, marketState)
    : undefined;
const server = createServer(
  createApp(
    new HealthService(),
    approvalService,
    positionService,
    agentControlService,
    replayController,
    () => ({
      dataMode: env.DATA_MODE,
      ingestion: liveController?.health() ??
        replayController?.status() ?? { status: 'unavailable' },
      notifications: notificationService.health(),
      freshness: {
        maximumAgeSeconds: env.MARKET_FRESHNESS_SECONDS,
        maximumAlignmentSeconds: env.MARKET_ALIGNMENT_SECONDS,
      },
    }),
  ),
);
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  liveController?.stop();

  console.log(`${signal} received; shutting down gracefully`);

  server.close(async (serverError) => {
    try {
      await closeDatabase();
    } catch (databaseError: unknown) {
      console.error('Failed to close the database pool', databaseError);
      process.exitCode = 1;
    }

    if (serverError) {
      console.error('HTTP server shutdown failed', serverError);
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

server.listen(env.PORT, () => {
  console.log(
    `pocketpilot server listening on port ${env.PORT} (${env.DATA_MODE}/${env.EXECUTION_MODE})`,
  );
  liveController?.start();
  if (env.DATA_MODE === 'live' && env.POLYMARKET_MARKETS_JSON.length === 0) {
    console.warn(
      'Live Polymarket ingestion is disabled until POLYMARKET_MARKETS_JSON is configured',
    );
  }
});

server.on('error', (error) => {
  console.error('HTTP server failed', error);
  process.exitCode = 1;
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
