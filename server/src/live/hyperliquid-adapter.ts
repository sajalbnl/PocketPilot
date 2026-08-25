import type { Asset } from '@pocketpilot/shared';

import type { RawMarketEvent } from '../market/raw-events.js';
import { hyperliquidMessageToRawEvent } from './normalizers.js';
import { ResubscribingWebSocketManager, type WebSocketManagerHealth } from './websocket-manager.js';

export interface HyperliquidHealth extends WebSocketManagerHealth {
  source: 'hyperliquid';
  symbols: string[];
  normalizedEvents: number;
  schemaErrors: number;
  lastEventAt: string | null;
}

export class HyperliquidLiveAdapter {
  private sequence = 0;
  private normalizedEvents = 0;
  private schemaErrors = 0;
  private lastEventAt: string | null = null;
  private readonly manager: ResubscribingWebSocketManager;

  constructor(
    options: {
      url: string;
      symbolMap: Record<string, Asset>;
      reconnectBaseMs: number;
      reconnectMaxMs: number;
      reconnectLimit: number;
      jitterRatio: number;
      heartbeatMs: number;
      onEvent: (event: RawMarketEvent) => Promise<void> | void;
    },
    managerOptions: {
      socketFactory?: ConstructorParameters<
        typeof ResubscribingWebSocketManager
      >[0]['socketFactory'];
      random?: () => number;
      now?: () => Date;
    } = {},
  ) {
    const symbols = Object.keys(options.symbolMap);
    this.manager = new ResubscribingWebSocketManager({
      url: options.url,
      subscriptions: symbols.map((coin) => ({ type: 'activeAssetCtx', coin })),
      reconnectBaseMs: options.reconnectBaseMs,
      reconnectMaxMs: options.reconnectMaxMs,
      reconnectLimit: options.reconnectLimit,
      jitterRatio: options.jitterRatio,
      heartbeatMs: options.heartbeatMs,
      ...managerOptions,
      onMessage: (data, receivedAt) => {
        try {
          const value = typeof data === 'string' ? (JSON.parse(data) as unknown) : data;
          const event = hyperliquidMessageToRawEvent({
            message: value,
            symbolMap: options.symbolMap,
            receivedAt,
            sequence: this.sequence,
          });
          if (!event) return;
          this.sequence += 1;
          this.normalizedEvents += 1;
          this.lastEventAt = receivedAt.toISOString();
          void Promise.resolve(options.onEvent(event)).catch((error: unknown) => {
            console.error('Hyperliquid downstream ingestion failed', error);
          });
        } catch (error: unknown) {
          this.schemaErrors += 1;
          console.error('Hyperliquid payload rejected by schema', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
  }

  start(): void {
    this.manager.start();
  }

  stop(): void {
    this.manager.stop();
  }

  health(symbols: string[]): HyperliquidHealth {
    return {
      source: 'hyperliquid',
      symbols,
      normalizedEvents: this.normalizedEvents,
      schemaErrors: this.schemaErrors,
      lastEventAt: this.lastEventAt,
      ...this.manager.health(),
    };
  }
}
