import { createServer } from 'node:http';

import { env } from './config/env.js';
import { closeDatabase } from './db/client.js';
import { AgentControlService } from './domain/agent-control-service.js';
import { ApprovalService } from './domain/approval-service.js';
import { HealthService } from './domain/health-service.js';
import { PositionService } from './domain/position-service.js';
import { PaperExecutionAdapter } from './execution/paper-adapter.js';
import { createApp } from './http/app.js';
import { MarketPriceService, NormalizedMarketState } from './market/price-service.js';
import { createReplayController } from './replay/runtime.js';
import { loadInvestorSkill } from './skill/loader.js';

const investorSkill = await loadInvestorSkill();
if (env.EXECUTION_MODE !== 'paper') {
  throw new Error(
    'Hyperliquid testnet execution is reserved for Phase 6; set EXECUTION_MODE=paper for Phase 5',
  );
}
const marketState = new NormalizedMarketState();
const priceService = new MarketPriceService(marketState);
const executionAdapter = new PaperExecutionAdapter(priceService, {
  feeBps: env.PAPER_FEE_BPS,
  slippageBps: env.PAPER_SLIPPAGE_BPS,
});
const approvalService = new ApprovalService(executionAdapter);
const positionService = new PositionService(executionAdapter);
const agentControlService = new AgentControlService();
const replayController =
  env.DATA_MODE === 'replay'
    ? await createReplayController(investorSkill, undefined, marketState)
    : undefined;
const server = createServer(
  createApp(
    new HealthService(),
    approvalService,
    positionService,
    agentControlService,
    replayController,
  ),
);
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

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
});

server.on('error', (error) => {
  console.error('HTTP server failed', error);
  process.exitCode = 1;
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
