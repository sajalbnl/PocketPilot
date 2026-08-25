import type {
  AdapterErrorCode,
  Asset,
  PriceQuote,
  SignalEvidence,
  TradeSide,
} from '@pocketpilot/shared';

export interface CurrentPriceInput {
  symbol: Asset;
  evidence: SignalEvidence | null;
  fallbackPrice: number | null;
}

export interface SubmitMarketOrderInput extends CurrentPriceInput {
  clientOrderId: string;
  side: TradeSide;
  notionalUsd: number;
  leverage: number;
  stopLossPrice: number;
  quote: PriceQuote;
}

export interface ExecutionResult {
  clientOrderId: string;
  venueOrderId: string;
  requestedPrice: number;
  fillPrice: number;
  quantity: number;
  feeUsd: number;
  slippageBps: number;
  executedAt: string;
}

export interface ClosePositionInput extends CurrentPriceInput {
  clientOrderId: string;
  side: TradeSide;
  entryPrice: number;
  quantity: number;
  entryFeeUsd: number;
  quote: PriceQuote;
}

export interface CloseExecutionResult extends ExecutionResult {
  realizedPnl: number;
}

export interface ExecutionAdapter {
  getCurrentPrice(input: CurrentPriceInput): Promise<PriceQuote>;
  submitMarketOrder(input: SubmitMarketOrderInput): Promise<ExecutionResult>;
  closePosition(input: ClosePositionInput): Promise<CloseExecutionResult>;
}

type FlatMetadata = Record<string, string | number | boolean | null>;

export class ExecutionAdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly metadata: FlatMetadata = {},
  ) {
    super(message);
    this.name = 'ExecutionAdapterError';
  }
}
