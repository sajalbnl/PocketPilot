import { createHash } from 'node:crypto';

import { ExchangeClient, HttpTransport, InfoClient, TESTNET_API_URL } from '@nktkas/hyperliquid';
import type { Asset, PriceQuote } from '@pocketpilot/shared';
import { privateKeyToAccount } from 'viem/accounts';

import {
  ExecutionAdapterError,
  type CloseExecutionResult,
  type ClosePositionInput,
  type CurrentPriceInput,
  type ExecutionAdapter,
  type ExecutionResult,
  type SubmitMarketOrderInput,
} from './adapter.js';

type Address = `0x${string}`;
type Cloid = `0x${string}`;

interface PerpMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
    isDelisted?: true;
  }>;
}

interface UserFill {
  coin: string;
  px: string;
  sz: string;
  time: number;
  oid: number;
  fee: string;
  feeToken: string;
  cloid?: Cloid;
}

interface OrderStatusResponse {
  status: 'unknownOid' | 'order';
  order?: {
    order: { coin: string; oid: number; origSz: string; sz: string };
    status: string;
    statusTimestamp: number;
  };
}

interface ClearinghouseState {
  assetPositions: Array<{ position: { coin: string; szi: string } }>;
}

interface UserRole {
  role: 'missing' | 'user' | 'vault' | 'agent' | 'subAccount';
  data?: { user?: Address; master?: Address };
}

interface OrderResponse {
  response: {
    data: {
      statuses: Array<
        | { filled: { totalSz: string; avgPx: string; oid: number; cloid?: Cloid } }
        | { resting: { oid: number; cloid?: Cloid } }
        | { error: string }
        | 'waitingForFill'
        | 'waitingForTrigger'
      >;
    };
  };
}

export interface HyperliquidTestnetClients {
  allMids(signal?: AbortSignal): Promise<Record<string, string>>;
  meta(signal?: AbortSignal): Promise<PerpMeta>;
  orderStatus(
    input: { user: Address; oid: number | Cloid },
    signal?: AbortSignal,
  ): Promise<OrderStatusResponse>;
  userFillsByTime(
    input: { user: Address; startTime: number; aggregateByTime: boolean },
    signal?: AbortSignal,
  ): Promise<UserFill[]>;
  clearinghouseState(input: { user: Address }, signal?: AbortSignal): Promise<ClearinghouseState>;
  userRole(input: { user: Address }, signal?: AbortSignal): Promise<UserRole>;
  updateLeverage(
    input: { asset: number; isCross: boolean; leverage: number },
    signal?: AbortSignal,
  ): Promise<unknown>;
  order(
    input: {
      orders: Array<{
        a: number;
        b: boolean;
        p: string;
        s: string;
        r: boolean;
        t: { limit: { tif: 'Ioc' } };
        c: Cloid;
      }>;
      grouping: 'na';
    },
    signal?: AbortSignal,
  ): Promise<OrderResponse>;
}

export interface HyperliquidTestnetAdapterOptions {
  accountAddress: Address;
  signerAddress: Address;
  signerKind: 'account' | 'api-wallet';
  timeoutMs: number;
  statusPollIntervalMs: number;
  statusPollAttempts: number;
  marketSlippageBps: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CreateHyperliquidTestnetAdapterOptions extends Omit<
  HyperliquidTestnetAdapterOptions,
  'signerAddress'
> {
  privateKey: `0x${string}`;
}

interface AssetMetadata {
  assetIndex: number;
  szDecimals: number;
}

interface FillConfirmation {
  venueOrderId: string;
  fillPrice: number;
  quantity: number;
  feeUsd: number;
  executedAt: string;
}

const ALLOWED_SYMBOLS = new Set<Asset>(['BTC', 'ETH']);
const TERMINAL_REJECTION_STATUSES = new Set([
  'canceled',
  'rejected',
  'marginCanceled',
  'vaultWithdrawalCanceled',
  'openInterestCapCanceled',
  'selfTradeCanceled',
  'reduceOnlyCanceled',
  'siblingFilledCanceled',
  'delistedCanceled',
  'liquidatedCanceled',
  'scheduledCancel',
  'tickRejected',
  'minTradeNtlRejected',
  'perpMarginRejected',
  'reduceOnlyRejected',
  'badAloPxRejected',
  'iocCancelRejected',
  'badTriggerPxRejected',
  'marketOrderNoLiquidityRejected',
  'positionIncreaseAtOpenInterestCapRejected',
  'positionFlipAtOpenInterestCapRejected',
  'tooAggressiveAtOpenInterestCapRejected',
  'openInterestIncreaseRejected',
  'oracleRejected',
  'perpMaxPositionRejected',
  'tooManyOpenOrdersRejected',
]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function stripFractionalZeros(value: string): string {
  return value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
}

/** Hyperliquid requires exactly 16 client-id bytes encoded as 32 hex characters. */
export function deriveHyperliquidCloid(clientOrderId: string): Cloid {
  return `0x${createHash('sha256').update(clientOrderId).digest('hex').slice(0, 32)}`;
}

export function formatHyperliquidSize(quantity: number, szDecimals: number): string {
  const scale = 10 ** szDecimals;
  const roundedDown = Math.floor((quantity + Number.EPSILON) * scale) / scale;
  if (!Number.isFinite(roundedDown) || roundedDown <= 0) {
    throw new ExecutionAdapterError(
      'ORDER_REJECTED',
      'The approved notional is below Hyperliquid testnet minimum size precision.',
      false,
      { szDecimals },
    );
  }
  return stripFractionalZeros(roundedDown.toFixed(szDecimals));
}

/** Implements Hyperliquid's documented five-significant-figure perp price rule. */
export function formatHyperliquidPrice(
  price: number,
  szDecimals: number,
  direction: 'up' | 'down',
): string {
  if (!Number.isFinite(price) || price <= 0) {
    throw new ExecutionAdapterError(
      'PRICE_UNAVAILABLE',
      'Testnet returned an invalid price.',
      true,
    );
  }
  const significantDecimals = 4 - Math.floor(Math.log10(price));
  const decimalPlaces = Math.max(0, Math.min(6 - szDecimals, significantDecimals));
  const scale = 10 ** decimalPlaces;
  const rounded =
    direction === 'up' ? Math.ceil(price * scale) / scale : Math.floor(price * scale) / scale;
  return stripFractionalZeros(rounded.toFixed(decimalPlaces));
}

export class HyperliquidTestnetExecutionAdapter implements ExecutionAdapter {
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly assets = new Map<Asset, AssetMetadata>();

  constructor(
    private readonly clients: HyperliquidTestnetClients,
    private readonly options: HyperliquidTestnetAdapterOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? defaultSleep;
    if (options.timeoutMs < 1 || options.statusPollAttempts < 1) {
      throw new Error('Hyperliquid testnet timeouts and polling attempts must be positive');
    }
    if (options.marketSlippageBps < 1 || options.marketSlippageBps > 500) {
      throw new Error('Hyperliquid testnet market slippage must be between 1 and 500 bps');
    }
  }

  static async create(
    options: CreateHyperliquidTestnetAdapterOptions,
  ): Promise<HyperliquidTestnetExecutionAdapter> {
    const wallet = privateKeyToAccount(options.privateKey);
    const transport = new HttpTransport({
      isTestnet: true,
      apiUrl: TESTNET_API_URL,
      timeout: options.timeoutMs,
    });
    if (!transport.isTestnet || String(transport.apiUrl) !== TESTNET_API_URL) {
      throw new Error('Hyperliquid execution transport is not pinned to the official testnet URL');
    }
    const info = new InfoClient({ transport });
    const exchange = new ExchangeClient({
      transport,
      wallet,
      defaultExpiresAfter: () => Date.now() + options.timeoutMs,
    });
    const clients: HyperliquidTestnetClients = {
      allMids: (signal) => info.allMids(signal),
      meta: (signal) => info.meta(signal),
      orderStatus: (input, signal) => info.orderStatus(input, signal),
      userFillsByTime: (input, signal) => info.userFillsByTime(input, signal),
      clearinghouseState: (input, signal) => info.clearinghouseState(input, signal),
      userRole: (input, signal) => info.userRole(input, signal),
      updateLeverage: (input, signal) =>
        exchange.updateLeverage(input, signal ? { signal } : undefined),
      order: (input, signal) => exchange.order(input, signal ? { signal } : undefined),
    };
    const adapter = new HyperliquidTestnetExecutionAdapter(clients, {
      ...options,
      signerAddress: wallet.address.toLowerCase() as Address,
    });
    await adapter.initialize();
    return adapter;
  }

  async initialize(): Promise<void> {
    try {
      const [role, meta] = await Promise.all([
        this.withTimeout((signal) =>
          this.clients.userRole({ user: this.options.signerAddress }, signal),
        ),
        this.withTimeout((signal) => this.clients.meta(signal)),
      ]);
      const account = this.options.accountAddress.toLowerCase();
      const signer = this.options.signerAddress.toLowerCase();
      if (this.options.signerKind === 'account') {
        if (account !== signer) {
          throw new ExecutionAdapterError(
            'ADAPTER_UNAVAILABLE',
            'The configured account key does not match HYPERLIQUID_ACCOUNT_ADDRESS.',
            false,
          );
        }
      } else if (role.role !== 'agent' || role.data?.user?.toLowerCase() !== account) {
        throw new ExecutionAdapterError(
          'ADAPTER_UNAVAILABLE',
          'The configured API wallet is not authorized for the configured testnet account.',
          false,
        );
      }
      this.cacheAllowedAssets(meta);
    } catch (error: unknown) {
      throw normalizeAdapterError(error, 'initialize');
    }
  }

  async getCurrentPrice(input: CurrentPriceInput): Promise<PriceQuote> {
    this.assertAllowed(input.symbol);
    try {
      const mids = await this.withTimeout((signal) => this.clients.allMids(signal));
      const price = Number(mids[input.symbol]);
      if (!Number.isFinite(price) || price <= 0) {
        throw new ExecutionAdapterError(
          'PRICE_UNAVAILABLE',
          `${input.symbol} has no valid Hyperliquid testnet mid price.`,
          true,
          { symbol: input.symbol },
        );
      }
      return {
        symbol: input.symbol,
        price,
        asOf: this.now().toISOString(),
        source: 'hyperliquid-testnet',
      };
    } catch (error: unknown) {
      throw normalizeAdapterError(error, 'price');
    }
  }

  async submitMarketOrder(input: SubmitMarketOrderInput): Promise<ExecutionResult> {
    this.assertAllowed(input.symbol);
    this.assertTestnetQuote(input.quote, input.symbol);
    if (!Number.isInteger(input.leverage)) {
      throw new ExecutionAdapterError(
        'ORDER_REJECTED',
        'Hyperliquid testnet requires whole-number leverage.',
        false,
        { leverage: input.leverage },
      );
    }
    const cloid = deriveHyperliquidCloid(input.clientOrderId);
    const existing = await this.reconcileExisting(cloid, input.quote.price);
    if (existing) return this.toExecutionResult(input.clientOrderId, input.quote.price, existing);

    const metadata = await this.assetMetadata(input.symbol);
    const size = formatHyperliquidSize(input.notionalUsd / input.quote.price, metadata.szDecimals);
    const isBuy = input.side === 'LONG';
    const limitPrice = formatHyperliquidPrice(
      input.quote.price * (1 + (isBuy ? 1 : -1) * (this.options.marketSlippageBps / 10_000)),
      metadata.szDecimals,
      isBuy ? 'up' : 'down',
    );
    const startedAt = this.now().getTime();

    try {
      await this.withTimeout((signal) =>
        this.clients.updateLeverage(
          { asset: metadata.assetIndex, isCross: true, leverage: input.leverage },
          signal,
        ),
      );
      const response = await this.withTimeout((signal) =>
        this.clients.order(
          {
            orders: [
              {
                a: metadata.assetIndex,
                b: isBuy,
                p: limitPrice,
                s: size,
                r: false,
                t: { limit: { tif: 'Ioc' } },
                c: cloid,
              },
            ],
            grouping: 'na',
          },
          signal,
        ),
      );
      const confirmation = await this.confirmSubmission(response, cloid, startedAt);
      return this.toExecutionResult(input.clientOrderId, input.quote.price, confirmation);
    } catch (error: unknown) {
      // The L1 may accept the cloid even when the HTTP response is lost. Reconcile before
      // returning an ambiguous transport failure so a fill or venue rejection is truthful.
      if (!(error instanceof ExecutionAdapterError)) {
        try {
          const reconciled = await this.reconcileExisting(cloid, input.quote.price);
          if (reconciled) {
            return this.toExecutionResult(input.clientOrderId, input.quote.price, reconciled);
          }
        } catch (reconciliationError: unknown) {
          if (
            reconciliationError instanceof ExecutionAdapterError &&
            reconciliationError.code === 'ORDER_REJECTED'
          ) {
            throw reconciliationError;
          }
        }
      }
      throw normalizeAdapterError(error, 'submit');
    }
  }

  async closePosition(input: ClosePositionInput): Promise<CloseExecutionResult> {
    this.assertAllowed(input.symbol);
    this.assertTestnetQuote(input.quote, input.symbol);
    const cloid = deriveHyperliquidCloid(input.clientOrderId);
    const existing = await this.reconcileExisting(cloid, input.quote.price);
    const confirmation = existing ?? (await this.submitReduceOnlyClose(input, cloid));
    const direction = input.side === 'LONG' ? 1 : -1;
    const closedRatio = Math.min(1, confirmation.quantity / input.quantity);
    const realizedPnl = round(
      direction * confirmation.quantity * (confirmation.fillPrice - input.entryPrice) -
        input.entryFeeUsd * closedRatio -
        confirmation.feeUsd,
    );
    return {
      ...this.toExecutionResult(input.clientOrderId, input.quote.price, confirmation),
      realizedPnl,
    };
  }

  private async submitReduceOnlyClose(
    input: ClosePositionInput,
    cloid: Cloid,
  ): Promise<FillConfirmation> {
    const metadata = await this.assetMetadata(input.symbol);
    try {
      const state = await this.withTimeout((signal) =>
        this.clients.clearinghouseState({ user: this.options.accountAddress }, signal),
      );
      const venuePosition = state.assetPositions.find(
        (candidate) => candidate.position.coin === input.symbol,
      );
      const venueQuantity = Number(venuePosition?.position.szi ?? 0);
      const expectedSign = input.side === 'LONG' ? 1 : -1;
      const tolerance = 10 ** -metadata.szDecimals;
      if (
        Math.sign(venueQuantity) !== expectedSign ||
        Math.abs(venueQuantity) + tolerance < input.quantity
      ) {
        throw new ExecutionAdapterError(
          'POSITION_NOT_FOUND',
          'The recorded position no longer matches the Hyperliquid testnet position; close was refused.',
          false,
          { symbol: input.symbol },
        );
      }
      const isBuy = input.side === 'SHORT';
      const limitPrice = formatHyperliquidPrice(
        input.quote.price * (1 + (isBuy ? 1 : -1) * (this.options.marketSlippageBps / 10_000)),
        metadata.szDecimals,
        isBuy ? 'up' : 'down',
      );
      const response = await this.withTimeout((signal) =>
        this.clients.order(
          {
            orders: [
              {
                a: metadata.assetIndex,
                b: isBuy,
                p: limitPrice,
                s: formatHyperliquidSize(input.quantity, metadata.szDecimals),
                r: true,
                t: { limit: { tif: 'Ioc' } },
                c: cloid,
              },
            ],
            grouping: 'na',
          },
          signal,
        ),
      );
      return await this.confirmSubmission(response, cloid, this.now().getTime());
    } catch (error: unknown) {
      throw normalizeAdapterError(error, 'close');
    }
  }

  private async confirmSubmission(
    response: OrderResponse,
    cloid: Cloid,
    startedAt: number,
  ): Promise<FillConfirmation> {
    const status = response.response.data.statuses[0];
    if (!status) {
      throw new ExecutionAdapterError(
        'ADAPTER_FAILURE',
        'Hyperliquid testnet returned no order status.',
        true,
      );
    }
    if (typeof status === 'object' && 'error' in status) {
      throw new ExecutionAdapterError(
        'ORDER_REJECTED',
        'Hyperliquid testnet rejected the order.',
        false,
        { venueReason: status.error.slice(0, 160) },
      );
    }
    if (typeof status === 'object' && 'filled' in status) {
      const fills = await this.findFills(status.filled.oid, startedAt);
      return (
        fills ?? {
          venueOrderId: String(status.filled.oid),
          fillPrice: Number(status.filled.avgPx),
          quantity: Number(status.filled.totalSz),
          feeUsd: 0,
          executedAt: this.now().toISOString(),
        }
      );
    }
    return this.pollForConfirmation(cloid, startedAt);
  }

  private async reconcileExisting(
    cloid: Cloid,
    requestedPrice: number,
  ): Promise<FillConfirmation | null> {
    try {
      const status = await this.withTimeout((signal) =>
        this.clients.orderStatus({ user: this.options.accountAddress, oid: cloid }, signal),
      );
      if (status.status === 'unknownOid') return null;
      return await this.confirmKnownStatus(status, cloid, this.now().getTime() - 86_400_000);
    } catch (error: unknown) {
      const normalized = normalizeAdapterError(error, 'reconcile');
      if (normalized.code === 'ORDER_REJECTED') throw normalized;
      throw new ExecutionAdapterError(
        normalized.code,
        'Could not safely reconcile the stable testnet client order ID; no new order was sent.',
        normalized.retryable,
        { requestedPrice },
      );
    }
  }

  private async pollForConfirmation(cloid: Cloid, startedAt: number): Promise<FillConfirmation> {
    for (let attempt = 0; attempt < this.options.statusPollAttempts; attempt += 1) {
      if (attempt > 0) await this.sleep(this.options.statusPollIntervalMs);
      const status = await this.withTimeout((signal) =>
        this.clients.orderStatus({ user: this.options.accountAddress, oid: cloid }, signal),
      );
      if (status.status === 'unknownOid') continue;
      const confirmation = await this.confirmKnownStatus(status, cloid, startedAt, false);
      if (confirmation) return confirmation;
    }
    throw new ExecutionAdapterError(
      'ADAPTER_FAILURE',
      'Testnet order confirmation timed out. Retry with the same approval revision to reconcile; paper was not used.',
      true,
      { cloid },
    );
  }

  private async confirmKnownStatus(
    response: OrderStatusResponse,
    cloid: Cloid,
    startedAt: number,
    throwWhenPending = true,
  ): Promise<FillConfirmation | null> {
    if (response.status !== 'order' || !response.order) return null;
    const { status, statusTimestamp, order } = response.order;
    if (status === 'filled') {
      const fills = await this.findFills(order.oid, startedAt);
      if (fills) return fills;
      throw new ExecutionAdapterError(
        'ADAPTER_FAILURE',
        'Testnet reports a fill but fill details are not yet available. Retry to reconcile.',
        true,
        { cloid, venueOrderId: order.oid },
      );
    }
    if (TERMINAL_REJECTION_STATUSES.has(status)) {
      throw new ExecutionAdapterError(
        'ORDER_REJECTED',
        `Hyperliquid testnet order ended with status ${status}.`,
        false,
        { cloid, venueOrderId: order.oid, venueStatus: status },
      );
    }
    if (!throwWhenPending) return null;
    throw new ExecutionAdapterError(
      'ADAPTER_FAILURE',
      'A previous testnet order with this approval ID is still pending; no duplicate was submitted.',
      true,
      { cloid, venueOrderId: order.oid, venueStatus: status, statusTimestamp },
    );
  }

  private async findFills(
    venueOrderId: number,
    startedAt: number,
  ): Promise<FillConfirmation | null> {
    for (let attempt = 0; attempt < this.options.statusPollAttempts; attempt += 1) {
      if (attempt > 0) await this.sleep(this.options.statusPollIntervalMs);
      const fills = await this.withTimeout((signal) =>
        this.clients.userFillsByTime(
          {
            user: this.options.accountAddress,
            startTime: Math.max(0, startedAt - 60_000),
            aggregateByTime: false,
          },
          signal,
        ),
      );
      const matching = fills.filter((fill) => fill.oid === venueOrderId);
      if (matching.length === 0) continue;
      const quantity = matching.reduce((total, fill) => total + Number(fill.sz), 0);
      const quoteValue = matching.reduce(
        (total, fill) => total + Number(fill.sz) * Number(fill.px),
        0,
      );
      const feeUsd = matching.reduce(
        (total, fill) => total + (fill.feeToken === 'USDC' ? Number(fill.fee) : 0),
        0,
      );
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(quoteValue)) {
        throw new ExecutionAdapterError(
          'ADAPTER_FAILURE',
          'Hyperliquid testnet returned invalid fill details.',
          true,
          { venueOrderId },
        );
      }
      return {
        venueOrderId: String(venueOrderId),
        fillPrice: quoteValue / quantity,
        quantity,
        feeUsd: Math.max(0, feeUsd),
        executedAt: new Date(Math.max(...matching.map((fill) => fill.time))).toISOString(),
      };
    }
    return null;
  }

  private toExecutionResult(
    clientOrderId: string,
    requestedPrice: number,
    fill: FillConfirmation,
  ): ExecutionResult {
    return {
      clientOrderId,
      venueOrderId: fill.venueOrderId,
      requestedPrice,
      fillPrice: round(fill.fillPrice),
      quantity: round(fill.quantity, 12),
      feeUsd: round(fill.feeUsd),
      slippageBps: round(Math.abs(fill.fillPrice / requestedPrice - 1) * 10_000, 4),
      executedAt: fill.executedAt,
    };
  }

  private async assetMetadata(symbol: Asset): Promise<AssetMetadata> {
    const cached = this.assets.get(symbol);
    if (cached) return cached;
    try {
      this.cacheAllowedAssets(await this.withTimeout((signal) => this.clients.meta(signal)));
      const loaded = this.assets.get(symbol);
      if (!loaded) throw new Error(`Missing ${symbol} metadata`);
      return loaded;
    } catch (error: unknown) {
      throw normalizeAdapterError(error, 'metadata');
    }
  }

  private cacheAllowedAssets(meta: PerpMeta): void {
    for (const symbol of ALLOWED_SYMBOLS) {
      const index = meta.universe.findIndex((asset) => asset.name === symbol && !asset.isDelisted);
      const asset = index >= 0 ? meta.universe[index] : undefined;
      if (!asset || !Number.isInteger(asset.szDecimals) || asset.szDecimals < 0) {
        throw new ExecutionAdapterError(
          'ADAPTER_UNAVAILABLE',
          `${symbol} is not an active Hyperliquid testnet perpetual.`,
          true,
          { symbol },
        );
      }
      this.assets.set(symbol, { assetIndex: index, szDecimals: asset.szDecimals });
    }
  }

  private assertAllowed(symbol: Asset): void {
    if (!ALLOWED_SYMBOLS.has(symbol)) {
      throw new ExecutionAdapterError(
        'ORDER_REJECTED',
        'Only BTC and ETH are enabled for Hyperliquid testnet execution.',
        false,
        { symbol },
      );
    }
  }

  private assertTestnetQuote(quote: PriceQuote, symbol: Asset): void {
    if (quote.source !== 'hyperliquid-testnet' || quote.symbol !== symbol) {
      throw new ExecutionAdapterError(
        'ORDER_REJECTED',
        'Hyperliquid testnet orders require a fresh quote from the testnet adapter.',
        false,
        { symbol, quoteSource: quote.source },
      );
    }
  }

  private async withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeAdapterError(
  error: unknown,
  operation: 'initialize' | 'price' | 'metadata' | 'reconcile' | 'submit' | 'close',
): ExecutionAdapterError {
  if (error instanceof ExecutionAdapterError) return error;
  const timeout =
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof Error && /timeout|timed out|aborted/iu.test(error.message));
  const code = operation === 'price' ? 'PRICE_UNAVAILABLE' : 'ADAPTER_UNAVAILABLE';
  return new ExecutionAdapterError(
    code,
    timeout
      ? `Hyperliquid testnet ${operation} timed out.`
      : `Hyperliquid testnet ${operation} failed safely; paper execution was not used.`,
    timeout || operation === 'price' || operation === 'reconcile',
    { operation },
  );
}
