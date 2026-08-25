import type { RawMarketEvent } from '../market/raw-events.js';
import {
  polymarketOutcomeTokenId,
  polymarketPollToRawEvent,
  type PolymarketMapping,
} from './normalizers.js';

export interface PolymarketHealth {
  source: 'polymarket';
  status: 'disabled' | 'idle' | 'polling' | 'ok' | 'degraded' | 'stopped';
  markets: Array<{ marketId: string; asset: string; outcome: string; meaning: string }>;
  polls: number;
  normalizedEvents: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextPollAt: string | null;
}

export class PolymarketPollingAdapter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private sequence = 0;
  private healthValue: PolymarketHealth;

  constructor(
    private readonly options: {
      gammaUrl: string;
      clobUrl: string;
      mappings: readonly PolymarketMapping[];
      pollIntervalMs: number;
      timeoutMs: number;
      onEvent: (event: RawMarketEvent) => Promise<void> | void;
      fetch?: typeof fetch;
      now?: () => Date;
    },
  ) {
    this.healthValue = {
      source: 'polymarket',
      status: options.mappings.length === 0 ? 'disabled' : 'idle',
      markets: options.mappings.map((mapping) => ({ ...mapping })),
      polls: 0,
      normalizedEvents: 0,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      nextPollAt: null,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (this.options.mappings.length === 0) return;
    void this.pollNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.healthValue.status = 'stopped';
    this.healthValue.nextPollAt = null;
  }

  health(): PolymarketHealth {
    return {
      ...this.healthValue,
      markets: this.healthValue.markets.map((market) => ({ ...market })),
    };
  }

  async pollNow(): Promise<void> {
    if (this.options.mappings.length === 0) return;
    this.healthValue.status = 'polling';
    this.healthValue.polls += 1;
    this.healthValue.lastAttemptAt = this.now().toISOString();
    try {
      for (const mapping of this.options.mappings) await this.pollMarket(mapping);
      this.healthValue.status = 'ok';
      this.healthValue.lastSuccessAt = this.now().toISOString();
      this.healthValue.lastError = null;
    } catch (error: unknown) {
      this.healthValue.status = 'degraded';
      this.healthValue.lastError = (error instanceof Error ? error.message : String(error)).slice(
        0,
        240,
      );
      console.error('Polymarket polling failed', { error: this.healthValue.lastError });
    } finally {
      this.scheduleNext();
    }
  }

  private async pollMarket(mapping: PolymarketMapping): Promise<void> {
    const gamma = await this.fetchJson(
      `${this.options.gammaUrl.replace(/\/$/u, '')}/markets/${encodeURIComponent(mapping.marketId)}`,
    );
    const tokenId = polymarketOutcomeTokenId(gamma, mapping.outcome);
    const midpointUrl = new URL(`${this.options.clobUrl.replace(/\/$/u, '')}/midpoint`);
    midpointUrl.searchParams.set('token_id', tokenId);
    const midpoint = await this.fetchJson(midpointUrl.toString());
    const receivedAt = this.now();
    const event = polymarketPollToRawEvent({
      market: gamma,
      midpoint,
      mapping,
      receivedAt,
      sequence: this.sequence,
    });
    this.sequence += 1;
    await this.options.onEvent(event);
    this.healthValue.normalizedEvents += 1;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await (this.options.fetch ?? fetch)(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) throw new Error(`Polymarket returned HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const next = new Date(this.now().getTime() + this.options.pollIntervalMs);
    this.healthValue.nextPollAt = next.toISOString();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pollNow();
    }, this.options.pollIntervalMs);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}
