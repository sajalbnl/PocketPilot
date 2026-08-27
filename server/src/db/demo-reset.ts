import { eq, inArray } from 'drizzle-orm';

import { env } from '../config/env.js';
import { closeDatabase, db } from './client.js';
import { mandates, orders, positions, signals } from './schema.js';

const DEMO_MANDATE_ID = '10000000-0000-4000-8000-000000000001';

async function resetDemo(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('The destructive demo reset is disabled in production');
  }
  await db.transaction(async (transaction) => {
    const demoSignalIds = transaction
      .select({ id: signals.id })
      .from(signals)
      .where(eq(signals.mandateId, DEMO_MANDATE_ID));
    const demoOrderIds = transaction
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.signalId, demoSignalIds));
    await transaction.delete(positions).where(inArray(positions.orderId, demoOrderIds));
    await transaction.delete(orders).where(inArray(orders.signalId, demoSignalIds));
    await transaction.delete(signals).where(eq(signals.mandateId, DEMO_MANDATE_ID));
    await transaction
      .update(mandates)
      .set({ killSwitchEnabled: false, updatedAt: new Date() })
      .where(eq(mandates.id, DEMO_MANDATE_ID));
  });
  console.log('Reset only the demo mandate signals, orders, and positions; kill switch is off');
}

resetDemo()
  .catch((error: unknown) => {
    console.error('Failed to reset demo state', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
