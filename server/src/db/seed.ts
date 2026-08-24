import { closeDatabase, db } from './client.js';
import { mandates } from './schema.js';

export const DEMO_MANDATE_ID = '10000000-0000-4000-8000-000000000001';

const demoMandate = {
  id: DEMO_MANDATE_ID,
  agentName: 'pocketpilot Demo Agent',
  skillSlug: 'cross-market-catalyst',
  allowedAssets: ['BTC', 'ETH'] as string[],
  allowedVenues: ['hyperliquid'] as string[],
  maxPositionUsd: 100,
  maxLeverage: 3,
  maxDailyLossUsd: 25,
  stopLossRequired: true,
  approvalRequired: true,
  signalExpiryMinutes: 10,
  killSwitchEnabled: false,
  version: 1,
};

async function seed(): Promise<void> {
  await db
    .insert(mandates)
    .values(demoMandate)
    .onConflictDoUpdate({
      target: mandates.id,
      set: {
        ...demoMandate,
        updatedAt: new Date(),
      },
    });

  console.log(`Seeded demo mandate ${DEMO_MANDATE_ID}`);
}

seed()
  .catch((error: unknown) => {
    console.error('Failed to seed demo mandate', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
