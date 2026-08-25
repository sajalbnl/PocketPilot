import type { NotificationDelivery, PushTokenRegistration } from '@pocketpilot/shared';
import { describe, expect, it } from 'vitest';

import type { PushGateway, PushMessage } from '../src/notification/expo-client.js';
import type {
  NotificationRepository,
  PendingNotificationClaim,
} from '../src/notification/repository.js';
import { NotificationService } from '../src/notification/service.js';

const token: PushTokenRegistration = {
  token: 'ExponentPushToken[test_device_123]',
  platform: 'android',
  registeredAt: '2026-08-25T09:00:00.000Z',
  lastSeenAt: '2026-08-25T09:00:00.000Z',
};

class ClaimOnceRepository implements NotificationRepository {
  claimed = false;
  delivery: NotificationDelivery | null = null;

  async claim(signalId: string): Promise<PendingNotificationClaim | null> {
    if (this.claimed) return null;
    this.claimed = true;
    return {
      signalId,
      symbol: 'BTC',
      side: 'LONG',
      confidence: 0.82,
      expiresAt: new Date('2026-08-25T09:10:00.000Z'),
      tokens: [token],
      transitionKey: `${signalId}:PENDING_APPROVAL`,
    };
  }

  async complete(_signalId: string, delivery: NotificationDelivery): Promise<void> {
    this.delivery = delivery;
  }
}

class CapturingGateway implements PushGateway {
  messages: PushMessage[] = [];
  async send(message: PushMessage) {
    this.messages.push(message);
    return { ticketIds: ['ticket-1'] };
  }
}

describe('pending approval notification', () => {
  it('sends once for one claimed transition and stores safe deep-link metadata', async () => {
    const repository = new ClaimOnceRepository();
    const gateway = new CapturingGateway();
    const service = new NotificationService(
      repository,
      gateway,
      () => new Date('2026-08-25T09:00:00.000Z'),
    );
    const signalId = '10000000-0000-4000-8000-000000000123';
    await service.notifyPendingApproval(signalId);
    await service.notifyPendingApproval(signalId);

    expect(gateway.messages).toHaveLength(1);
    expect(gateway.messages[0]).toMatchObject({
      title: 'BTC LONG needs approval',
      body: '82% confidence · expires in 10 min',
      data: {
        type: 'signal_approval_required',
        signalId,
        url: `pocketpilot://signals/${signalId}`,
      },
    });
    expect(repository.delivery).toMatchObject({ status: 'SENT', ticketIds: ['ticket-1'] });
  });

  it('records gateway failure without throwing to signal creation', async () => {
    const repository = new ClaimOnceRepository();
    const service = new NotificationService(repository, {
      send: async () => {
        throw new Error('provider unavailable');
      },
    });
    await expect(
      service.notifyPendingApproval('10000000-0000-4000-8000-000000000124'),
    ).resolves.toBeUndefined();
    expect(repository.delivery).toMatchObject({
      status: 'ERROR',
      error: { code: 'EXPO_PUSH_FAILED' },
    });
  });
});
