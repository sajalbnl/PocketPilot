import { env } from '../config/env.js';
import { getCurrentMandate } from '../db/mandate-repository.js';
import { persistCandidate } from '../db/candidate-repository.js';
import type { NormalizedMarketState } from '../market/price-service.js';
import type { SignalReasoningService } from '../reasoning/service.js';
import { MarketSignalPipeline } from '../signal/pipeline.js';
import type { InvestorSkill } from '../skill/schema.js';
import { HyperliquidLiveAdapter } from './hyperliquid-adapter.js';
import { PolymarketPollingAdapter } from './polymarket-adapter.js';

export interface LiveIngestionHealth {
  mode: 'live';
  startedAt: string | null;
  processedEvents: number;
  candidatesCreated: number;
  lastNormalizedAt: string | null;
  lastPipelineError: string | null;
  hyperliquid: ReturnType<HyperliquidLiveAdapter['health']>;
  polymarket: ReturnType<PolymarketPollingAdapter['health']>;
}

export class LiveIngestionController {
  private startedAt: string | null = null;
  private processedEvents = 0;
  private candidatesCreated = 0;
  private lastNormalizedAt: string | null = null;
  private lastPipelineError: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly pipeline: MarketSignalPipeline,
    private readonly marketState: NormalizedMarketState,
    private readonly hyperliquid: HyperliquidLiveAdapter,
    private readonly polymarket: PolymarketPollingAdapter,
    private readonly hyperliquidSymbols: string[],
  ) {}

  start(): void {
    if (this.startedAt) return;
    this.startedAt = new Date().toISOString();
    this.hyperliquid.start();
    this.polymarket.start();
  }

  stop(): void {
    this.hyperliquid.stop();
    this.polymarket.stop();
  }

  health(): LiveIngestionHealth {
    return {
      mode: 'live',
      startedAt: this.startedAt,
      processedEvents: this.processedEvents,
      candidatesCreated: this.candidatesCreated,
      lastNormalizedAt: this.lastNormalizedAt,
      lastPipelineError: this.lastPipelineError,
      hyperliquid: this.hyperliquid.health(this.hyperliquidSymbols),
      polymarket: this.polymarket.health(),
    };
  }

  ingest(event: Parameters<MarketSignalPipeline['ingest']>[0]): Promise<void> {
    const process = async () => {
      try {
        const result = await this.pipeline.ingest(event);
        this.marketState.ingest(result.normalized);
        this.processedEvents += 1;
        this.lastNormalizedAt = result.normalized.ingestedAt;
        if (result.persisted?.created) this.candidatesCreated += 1;
        this.lastPipelineError = null;
      } catch (error: unknown) {
        this.lastPipelineError = (error instanceof Error ? error.message : String(error)).slice(
          0,
          240,
        );
        console.error('Live normalized pipeline rejected an event', {
          error: this.lastPipelineError,
        });
      }
    };
    this.queue = this.queue.then(process, process);
    return this.queue;
  }
}

export async function createLiveIngestionController(
  skill: InvestorSkill,
  reasoningService: SignalReasoningService,
  marketState: NormalizedMarketState,
): Promise<LiveIngestionController> {
  const mandate = await getCurrentMandate();
  if (!mandate) throw new Error('Live Mode requires the demo mandate; run npm run db:seed first');
  const pipeline = new MarketSignalPipeline(
    skill,
    'live-v1',
    {
      persist: async (candidate) => {
        const persisted = await persistCandidate(mandate.id, candidate, 'live');
        if (persisted.created) await reasoningService.analyze(persisted.signalId, skill);
        return persisted;
      },
    },
    {
      freshnessSeconds: env.MARKET_FRESHNESS_SECONDS,
      alignmentSeconds: env.MARKET_ALIGNMENT_SECONDS,
    },
  );

  let ingestEvent: LiveIngestionController['ingest'] = async () => {};
  const symbolMap = env.HYPERLIQUID_SYMBOL_MAP;
  const hyperliquid = new HyperliquidLiveAdapter({
    url: env.HYPERLIQUID_WS_URL,
    symbolMap,
    reconnectBaseMs: env.HYPERLIQUID_RECONNECT_BASE_MS,
    reconnectMaxMs: env.HYPERLIQUID_RECONNECT_MAX_MS,
    reconnectLimit: env.HYPERLIQUID_RECONNECT_LIMIT,
    jitterRatio: env.HYPERLIQUID_RECONNECT_JITTER,
    heartbeatMs: env.HYPERLIQUID_HEARTBEAT_MS,
    onEvent: (event) => ingestEvent(event),
  });
  const polymarket = new PolymarketPollingAdapter({
    gammaUrl: env.POLYMARKET_GAMMA_URL,
    clobUrl: env.POLYMARKET_CLOB_URL,
    mappings: env.POLYMARKET_MARKETS_JSON,
    pollIntervalMs: env.POLYMARKET_POLL_INTERVAL_MS,
    timeoutMs: env.MARKET_HTTP_TIMEOUT_MS,
    onEvent: (event) => ingestEvent(event),
  });
  const controller = new LiveIngestionController(
    pipeline,
    marketState,
    hyperliquid,
    polymarket,
    Object.keys(symbolMap),
  );
  ingestEvent = (event) => controller.ingest(event);
  return controller;
}
