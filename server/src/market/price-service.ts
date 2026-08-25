import type {
  Asset,
  HyperliquidMarketSample,
  NormalizedMarketSample,
  PriceQuote,
} from '@pocketpilot/shared';

import type { CurrentPriceInput } from '../execution/adapter.js';
import { ExecutionAdapterError } from '../execution/adapter.js';
import type { PriceProvider } from '../execution/paper-adapter.js';

export class NormalizedMarketState {
  private readonly marks = new Map<Asset, HyperliquidMarketSample>();

  ingest(sample: NormalizedMarketSample): void {
    if (sample.source === 'hyperliquid') this.marks.set(sample.symbol, sample);
  }

  get(symbol: Asset): HyperliquidMarketSample | null {
    return this.marks.get(symbol) ?? null;
  }

  reset(): void {
    this.marks.clear();
  }
}

export class MarketPriceService implements PriceProvider {
  constructor(private readonly state: NormalizedMarketState) {}

  getCurrentPrice(input: CurrentPriceInput): Promise<PriceQuote> {
    const current = this.state.get(input.symbol);
    if (current) {
      return Promise.resolve({
        symbol: input.symbol,
        price: current.markPrice,
        asOf: current.sourceTimestamp,
        source: 'normalized-replay-mark',
      });
    }

    const evidenceMark = input.evidence
      ? [...input.evidence.hyperliquid]
          .filter((sample) => sample.symbol === input.symbol)
          .sort(
            (left, right) =>
              new Date(left.sourceTimestamp).getTime() - new Date(right.sourceTimestamp).getTime(),
          )
          .at(-1)
      : undefined;
    if (evidenceMark) {
      return Promise.resolve({
        symbol: input.symbol,
        price: evidenceMark.markPrice,
        asOf: evidenceMark.sourceTimestamp,
        source: 'signal-evidence-mark',
      });
    }

    if (input.fallbackPrice !== null && input.fallbackPrice > 0) {
      return Promise.resolve({
        symbol: input.symbol,
        price: input.fallbackPrice,
        asOf: new Date().toISOString(),
        source: 'stored-position-mark',
      });
    }

    return Promise.reject(
      new ExecutionAdapterError(
        'PRICE_UNAVAILABLE',
        `No normalized ${input.symbol} mark price is available`,
        true,
        { symbol: input.symbol },
      ),
    );
  }
}
