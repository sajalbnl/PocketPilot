import { createHash } from 'node:crypto';

import type { PriceQuote, TradeSide } from '@pocketpilot/shared';

import type {
  CloseExecutionResult,
  ClosePositionInput,
  CurrentPriceInput,
  ExecutionAdapter,
  ExecutionResult,
  SubmitMarketOrderInput,
} from './adapter.js';

export interface PriceProvider {
  getCurrentPrice(input: CurrentPriceInput): Promise<PriceQuote>;
}

export interface PaperExecutionOptions {
  feeBps: number;
  slippageBps: number;
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function venueId(clientOrderId: string, action: 'open' | 'close'): string {
  return `paper-${createHash('sha256').update(`${action}:${clientOrderId}`).digest('hex').slice(0, 24)}`;
}

function slippageMultiplier(side: TradeSide, action: 'open' | 'close', bps: number): number {
  const openingBuy = side === 'LONG';
  const isBuy = action === 'open' ? openingBuy : !openingBuy;
  return 1 + (isBuy ? 1 : -1) * (bps / 10_000);
}

export function calculateUnrealizedPnl(input: {
  side: TradeSide;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  entryFeeUsd: number;
}): number {
  const direction = input.side === 'LONG' ? 1 : -1;
  return round(
    direction * input.quantity * (input.currentPrice - input.entryPrice) - input.entryFeeUsd,
  );
}

export function calculateRealizedPnl(input: {
  side: TradeSide;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  entryFeeUsd: number;
  exitFeeUsd: number;
}): number {
  const direction = input.side === 'LONG' ? 1 : -1;
  return round(
    direction * input.quantity * (input.closePrice - input.entryPrice) -
      input.entryFeeUsd -
      input.exitFeeUsd,
  );
}

export class PaperExecutionAdapter implements ExecutionAdapter {
  constructor(
    private readonly prices: PriceProvider,
    private readonly options: PaperExecutionOptions,
  ) {
    if (options.feeBps < 0 || options.slippageBps < 0) {
      throw new Error('Paper fee and slippage must be non-negative');
    }
  }

  getCurrentPrice(input: CurrentPriceInput): Promise<PriceQuote> {
    return this.prices.getCurrentPrice(input);
  }

  submitMarketOrder(input: SubmitMarketOrderInput): Promise<ExecutionResult> {
    const fillPrice = round(
      input.quote.price * slippageMultiplier(input.side, 'open', this.options.slippageBps),
    );
    const quantity = round(input.notionalUsd / fillPrice, 12);
    const feeUsd = round(input.notionalUsd * (this.options.feeBps / 10_000));
    return Promise.resolve({
      clientOrderId: input.clientOrderId,
      venueOrderId: venueId(input.clientOrderId, 'open'),
      requestedPrice: input.quote.price,
      fillPrice,
      quantity,
      feeUsd,
      slippageBps: this.options.slippageBps,
      executedAt: input.quote.asOf,
    });
  }

  closePosition(input: ClosePositionInput): Promise<CloseExecutionResult> {
    const fillPrice = round(
      input.quote.price * slippageMultiplier(input.side, 'close', this.options.slippageBps),
    );
    const closeNotionalUsd = input.quantity * fillPrice;
    const feeUsd = round(closeNotionalUsd * (this.options.feeBps / 10_000));
    return Promise.resolve({
      clientOrderId: input.clientOrderId,
      venueOrderId: venueId(input.clientOrderId, 'close'),
      requestedPrice: input.quote.price,
      fillPrice,
      quantity: input.quantity,
      feeUsd,
      slippageBps: this.options.slippageBps,
      executedAt: input.quote.asOf,
      realizedPnl: calculateRealizedPnl({
        side: input.side,
        entryPrice: input.entryPrice,
        closePrice: fillPrice,
        quantity: input.quantity,
        entryFeeUsd: input.entryFeeUsd,
        exitFeeUsd: feeUsd,
      }),
    });
  }
}
