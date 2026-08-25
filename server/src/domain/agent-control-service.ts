import {
  AgentControlStateSchema,
  type AgentControlState,
  type KillSwitchUpdateRequest,
} from '@pocketpilot/shared';
import { asc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { mandates } from '../db/schema.js';

export class AgentControlError extends Error {
  readonly code = 'MANDATE_NOT_FOUND';
}

function mapControl(row: typeof mandates.$inferSelect): AgentControlState {
  return AgentControlStateSchema.parse({
    mandateId: row.id,
    agentName: row.agentName,
    killSwitchEnabled: row.killSwitchEnabled,
    mandateVersion: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export class AgentControlService {
  async get(): Promise<AgentControlState> {
    const [row] = await db.select().from(mandates).orderBy(asc(mandates.createdAt)).limit(1);
    if (!row) throw new AgentControlError('Current mandate was not found');
    return mapControl(row);
  }

  async setKillSwitch(request: KillSwitchUpdateRequest): Promise<AgentControlState> {
    return db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(mandates)
        .orderBy(asc(mandates.createdAt))
        .for('update')
        .limit(1);
      if (!current) throw new AgentControlError('Current mandate was not found');
      if (current.killSwitchEnabled === request.enabled) return mapControl(current);
      const [updated] = await transaction
        .update(mandates)
        .set({
          killSwitchEnabled: request.enabled,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mandates.id, current.id))
        .returning();
      if (!updated) throw new Error('Kill-switch update did not return a mandate');
      return mapControl(updated);
    });
  }
}
