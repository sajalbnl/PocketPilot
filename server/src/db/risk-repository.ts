import { and, eq, gte } from 'drizzle-orm';

import { db } from './client.js';
import { positions } from './schema.js';

export async function getDailyRealizedLossUsd(now = new Date()): Promise<number> {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const rows = await db
    .select({ realizedPnl: positions.realizedPnl })
    .from(positions)
    .where(and(eq(positions.status, 'CLOSED'), gte(positions.closedAt, dayStart)));
  const netRealizedPnl = rows.reduce((sum, row) => sum + (row.realizedPnl ?? 0), 0);
  return Math.max(0, -netRealizedPnl);
}
