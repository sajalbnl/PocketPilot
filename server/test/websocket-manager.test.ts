import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  boundedBackoffDelay,
  ResubscribingWebSocketManager,
  type WebSocketLike,
} from '../src/live/websocket-manager.js';

class FakeSocket implements WebSocketLike {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}

afterEach(() => vi.useRealTimers());

describe('bounded WebSocket reconnect and resubscription', () => {
  it('caps exponential delay and applies bounded jitter', () => {
    expect(
      boundedBackoffDelay({
        attempt: 8,
        baseMs: 500,
        maxMs: 30_000,
        jitterRatio: 0.2,
        random: () => 1,
      }),
    ).toBe(30_000);
    expect(
      boundedBackoffDelay({
        attempt: 0,
        baseMs: 500,
        maxMs: 30_000,
        jitterRatio: 0.2,
        random: () => 0,
      }),
    ).toBe(400);
  });

  it('reconnects once and resends every subscription', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const manager = new ResubscribingWebSocketManager({
      url: 'wss://example.test/ws',
      subscriptions: [
        { type: 'activeAssetCtx', coin: 'BTC' },
        { type: 'activeAssetCtx', coin: 'ETH' },
      ],
      reconnectBaseMs: 500,
      reconnectMaxMs: 5_000,
      reconnectLimit: 2,
      jitterRatio: 0,
      heartbeatMs: 30_000,
      random: () => 0.5,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage: () => {},
    });
    manager.start();
    sockets[0]?.onopen?.();
    expect(sockets[0]?.sent).toHaveLength(2);
    sockets[0]?.onclose?.({ code: 1006, reason: 'test disconnect' });
    await vi.advanceTimersByTimeAsync(500);
    expect(sockets).toHaveLength(2);
    sockets[1]?.onopen?.();
    expect(sockets[1]?.sent).toEqual(sockets[0]?.sent);
    expect(manager.health()).toMatchObject({ status: 'connected', subscriptionsSent: 4 });
    manager.stop();
  });
});
