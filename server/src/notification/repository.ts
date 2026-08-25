import {
  NotificationDeliverySchema,
  PushTokenRegistrationSchema,
  type NotificationDelivery,
  type PushTokenRegistration,
} from '@pocketpilot/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/client.js';
import { mandates, signals } from '../db/schema.js';

export interface PendingNotificationClaim {
  signalId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  confidence: number;
  expiresAt: Date;
  tokens: PushTokenRegistration[];
  transitionKey: string;
}

export interface NotificationRepository {
  claim(signalId: string, now: Date): Promise<PendingNotificationClaim | null>;
  complete(signalId: string, delivery: NotificationDelivery): Promise<void>;
}

export class PostgresNotificationRepository implements NotificationRepository {
  async claim(signalId: string, now: Date): Promise<PendingNotificationClaim | null> {
    const transitionKey = `${signalId}:PENDING_APPROVAL`;
    const claimedDelivery = NotificationDeliverySchema.parse({
      transitionKey,
      status: 'CLAIMED',
      attemptedAt: now.toISOString(),
      completedAt: null,
      recipientCount: 0,
      ticketIds: [],
      error: null,
    });
    const [signal] = await db
      .update(signals)
      .set({ notification: claimedDelivery, updatedAt: now })
      .where(
        and(
          eq(signals.id, signalId),
          eq(signals.state, 'PENDING_APPROVAL'),
          isNull(signals.notification),
        ),
      )
      .returning({
        id: signals.id,
        mandateId: signals.mandateId,
        symbol: signals.symbol,
        side: signals.side,
        llmOutput: signals.llmOutput,
        expiresAt: signals.expiresAt,
      });
    if (!signal || !signal.side || !signal.expiresAt || signal.llmOutput?.decision !== 'PROPOSE') {
      return null;
    }

    const [mandate] = await db
      .select({ pushTokens: mandates.pushTokens })
      .from(mandates)
      .where(eq(mandates.id, signal.mandateId))
      .limit(1);
    const tokens = (mandate?.pushTokens ?? []).map((token) =>
      PushTokenRegistrationSchema.parse(token),
    );
    return {
      signalId: signal.id,
      symbol: signal.symbol,
      side: signal.side,
      confidence: signal.llmOutput.confidence,
      expiresAt: signal.expiresAt,
      tokens,
      transitionKey,
    };
  }

  async complete(signalId: string, delivery: NotificationDelivery): Promise<void> {
    const value = NotificationDeliverySchema.parse(delivery);
    await db
      .update(signals)
      .set({ notification: value, updatedAt: new Date() })
      .where(eq(signals.id, signalId));
  }
}

export async function registerPushToken(input: {
  token: string;
  platform: 'android' | 'ios';
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  return db.transaction(async (transaction) => {
    const [mandate] = await transaction
      .select({ id: mandates.id, pushTokens: mandates.pushTokens })
      .from(mandates)
      .orderBy(asc(mandates.createdAt))
      .limit(1)
      .for('update');
    if (!mandate) throw new Error('Current mandate was not found');

    const existing = mandate.pushTokens.map((item) => PushTokenRegistrationSchema.parse(item));
    const previous = existing.find((item) => item.token === input.token);
    const registration = PushTokenRegistrationSchema.parse({
      token: input.token,
      platform: input.platform,
      registeredAt: previous?.registeredAt ?? now.toISOString(),
      lastSeenAt: now.toISOString(),
    });
    const pushTokens = [
      ...existing.filter((item) => item.token !== input.token),
      registration,
    ].slice(-5);
    await transaction
      .update(mandates)
      .set({ pushTokens, updatedAt: now })
      .where(eq(mandates.id, mandate.id));
    return pushTokens.length;
  });
}
