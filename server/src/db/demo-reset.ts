import { eq } from 'drizzle-orm';

import { env } from '../config/env.js';
import { closeDatabase, db } from './client.js';
import { mandates, orders, positions, signals } from './schema.js';

const DEMO_MANDATE_ID = '10000000-0000-4000-8000-000000000001';

async function resetDemo(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('The destructive demo reset is disabled in production');
  }
  await db.transaction(async (transaction) => {
    await transaction.delete(positions);
    await transaction.delete(orders);
    await transaction.delete(signals);
    await transaction
      .update(mandates)
      .set({ killSwitchEnabled: false, updatedAt: new Date() })
      .where(eq(mandates.id, DEMO_MANDATE_ID));
  });
  console.log('Reset demo signals, orders, and positions; kill switch is off');
}

resetDemo()
  .catch((error: unknown) => {
    console.error('Failed to reset demo state', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
