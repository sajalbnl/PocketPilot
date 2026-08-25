import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDatabase, db } from '../src/db/client.js';
import { mandates, signals } from '../src/db/schema.js';
import { PostgresNotificationRepository } from '../src/notification/repository.js';

const runIntegration = process.env.RUN_DB_INTEGRATION === '1';
const mandateId = '10000000-0000-4000-8000-000000000099';
const signalId = '10000000-0000-4000-8000-000000000199';
const createdAt = new Date('2099-01-01T00:00:00.000Z');

describe.skipIf(!runIntegration)('Phase 6 PostgreSQL notification claim', () => {
  beforeAll(async () => {
    await db.insert(mandates).values({
      id: mandateId,
      agentName: 'Phase 6 Notification Test',
      skillSlug: 'cross-market-catalyst',
      allowedAssets: ['BTC', 'ETH'],
      allowedVenues: ['hyperliquid'],
      maxPositionUsd: 100,
      maxLeverage: 3,
      maxDailyLossUsd: 25,
      stopLossRequired: true,
      approvalRequired: true,
      signalExpiryMinutes: 10,
      killSwitchEnabled: false,
      pushTokens: [
        {
          token: 'ExponentPushToken[integration_device_123]',
          platform: 'android',
          registeredAt: createdAt.toISOString(),
          lastSeenAt: createdAt.toISOString(),
        },
      ],
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(signals).values({
      id: signalId,
      mandateId,
      symbol: 'BTC',
      side: 'LONG',
      state: 'PENDING_APPROVAL',
      dataMode: 'replay',
      llmOutput: {
        schemaVersion: 1,
        decision: 'PROPOSE',
        asset: 'BTC',
        direction: 'LONG',
        venue: 'hyperliquid',
        thesis: 'Integration test proposal with deterministic notification ownership.',
        whyNow: ['The notification claim needs concurrent verification.'],
        evidenceReferences: ['integration-evidence'],
        counterEvidence: ['This is a test record only.'],
        confidence: 0.8,
        proposedNotionalUsd: 100,
        leverage: 2,
        entryReference: 65_000,
        stopLoss: 64_000,
        invalidationConditions: ['The test completes.'],
        expiryMinutes: 10,
      },
      expiresAt: new Date('2099-01-01T00:10:00.000Z'),
      timeline: [],
      createdAt,
      updatedAt: createdAt,
    });
  });

  afterAll(async () => {
    await db.delete(signals).where(eq(signals.id, signalId));
    await db.delete(mandates).where(eq(mandates.id, mandateId));
    await closeDatabase();
  });

  it('allows exactly one concurrent claim for one PENDING_APPROVAL transition', async () => {
    const repository = new PostgresNotificationRepository();
    const [first, second] = await Promise.all([
      repository.claim(signalId, createdAt),
      repository.claim(signalId, createdAt),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const [row] = await db
      .select({ notification: signals.notification })
      .from(signals)
      .where(eq(signals.id, signalId));
    expect(row?.notification).toMatchObject({
      transitionKey: `${signalId}:PENDING_APPROVAL`,
      status: 'CLAIMED',
    });
  });
});
