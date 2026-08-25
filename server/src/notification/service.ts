import {
  NotificationDeliverySchema,
  SignalNotificationDataSchema,
  type NotificationDelivery,
} from '@pocketpilot/shared';

import type { PushGateway } from './expo-client.js';
import type { NotificationRepository, PendingNotificationClaim } from './repository.js';

export interface PendingApprovalNotifier {
  notifyPendingApproval(signalId: string): Promise<void>;
}

export interface NotificationHealth {
  status: 'idle' | 'ok' | 'degraded';
  attempted: number;
  sent: number;
  skipped: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastTicketIds: string[];
}

export class NotificationService implements PendingApprovalNotifier {
  private healthValue: NotificationHealth = {
    status: 'idle',
    attempted: 0,
    sent: 0,
    skipped: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastTicketIds: [],
  };

  constructor(
    private readonly repository: NotificationRepository,
    private readonly gateway: PushGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  health(): NotificationHealth {
    return { ...this.healthValue, lastTicketIds: [...this.healthValue.lastTicketIds] };
  }

  async notifyPendingApproval(signalId: string): Promise<void> {
    const attemptedAt = this.now();
    this.healthValue.attempted += 1;
    this.healthValue.lastAttemptAt = attemptedAt.toISOString();
    this.healthValue.lastTicketIds = [];
    let claim: PendingNotificationClaim | null = null;
    try {
      claim = await this.repository.claim(signalId, attemptedAt);
      if (!claim) return;
      if (claim.tokens.length === 0) {
        await this.finish(claim, attemptedAt, 'SKIPPED', [], null);
        this.healthValue.status = 'ok';
        this.healthValue.skipped += 1;
        return;
      }

      const route = `/signals/${claim.signalId}`;
      const data = SignalNotificationDataSchema.parse({
        type: 'signal_approval_required',
        signalId: claim.signalId,
        url: `pocketpilot://${route.slice(1)}`,
      });
      const result = await this.gateway.send({
        to: claim.tokens.map((registration) => registration.token),
        title: `${claim.symbol} ${claim.side} needs approval`,
        body: `${Math.round(claim.confidence * 100)}% confidence · ${expiryUrgency(claim.expiresAt, attemptedAt)}`,
        data,
      });
      await this.finish(claim, attemptedAt, 'SENT', result.ticketIds, null);
      this.healthValue.status = 'ok';
      this.healthValue.sent += 1;
      this.healthValue.lastSuccessAt = this.now().toISOString();
      this.healthValue.lastError = null;
      this.healthValue.lastTicketIds = [...result.ticketIds];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.healthValue.status = 'degraded';
      this.healthValue.lastError = message.slice(0, 240);
      if (claim) {
        try {
          await this.finish(claim, attemptedAt, 'ERROR', [], message);
        } catch (persistenceError: unknown) {
          console.error('Failed to persist notification error metadata', persistenceError);
        }
      }
      console.error('Push notification failed without affecting signal creation', {
        signalId,
        error: message.slice(0, 240),
      });
    }
  }

  private async finish(
    claim: PendingNotificationClaim,
    attemptedAt: Date,
    status: NotificationDelivery['status'],
    ticketIds: string[],
    errorMessage: string | null,
  ): Promise<void> {
    const completedAt = this.now();
    await this.repository.complete(
      claim.signalId,
      NotificationDeliverySchema.parse({
        transitionKey: claim.transitionKey,
        status,
        attemptedAt: attemptedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        recipientCount: claim.tokens.length,
        ticketIds,
        error: errorMessage
          ? {
              code: 'EXPO_PUSH_FAILED',
              message: errorMessage.slice(0, 240),
              occurredAt: completedAt.toISOString(),
              retryable: true,
              metadata: {},
            }
          : null,
      }),
    );
  }
}

function expiryUrgency(expiresAt: Date, now: Date): string {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000));
  if (remainingSeconds < 60) return `expires in ${remainingSeconds}s`;
  return `expires in ${Math.ceil(remainingSeconds / 60)} min`;
}
