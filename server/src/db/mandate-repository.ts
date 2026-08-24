import { MandateSchema, type Mandate } from '@pocketpilot/shared';
import { asc } from 'drizzle-orm';

import { db } from './client.js';
import { mandates } from './schema.js';

export async function getCurrentMandate(): Promise<Mandate | null> {
  const [row] = await db.select().from(mandates).orderBy(asc(mandates.createdAt)).limit(1);
  if (!row) return null;

  return MandateSchema.parse({
    id: row.id,
    agentName: row.agentName,
    skillSlug: row.skillSlug,
    allowedAssets: row.allowedAssets,
    allowedVenues: row.allowedVenues,
    riskLimits: {
      maxPositionUsd: row.maxPositionUsd,
      maxLeverage: row.maxLeverage,
      maxDailyLossUsd: row.maxDailyLossUsd,
      stopLossRequired: row.stopLossRequired,
      approvalRequired: row.approvalRequired,
      signalExpiryMinutes: row.signalExpiryMinutes,
    },
    killSwitchEnabled: row.killSwitchEnabled,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
