import type {
  Asset,
  HyperliquidMarketSample,
  NormalizedMarketSample,
  PolymarketMarketSample,
} from '@pocketpilot/shared';

import { normalizeMarketEvent } from '../market/normalize.js';
import type { RawMarketEvent } from '../market/raw-events.js';
import type { InvestorSkill } from '../skill/schema.js';
import { evaluateSkill, type CandidateSignal, type RuleEvaluation } from './evaluate.js';
import { calculateFeatureSnapshot, type FeatureSnapshot } from './features.js';

export interface CandidateSink {
  persist(candidate: CandidateSignal): Promise<{ signalId: string; created: boolean }>;
}

export interface PipelineEventResult {
  normalized: NormalizedMarketSample;
  snapshot: FeatureSnapshot;
  rules: RuleEvaluation[];
  candidate: CandidateSignal | null;
  persisted: { signalId: string; created: boolean } | null;
}

export class MarketSignalPipeline {
  private readonly hyperliquid: HyperliquidMarketSample[] = [];
  private readonly polymarket: PolymarketMarketSample[] = [];
  private readonly emittedKeys = new Set<string>();

  constructor(
    private readonly skill: InvestorSkill,
    private readonly replayId: string,
    private readonly sink: CandidateSink,
  ) {}

  async ingest(event: RawMarketEvent): Promise<PipelineEventResult> {
    const normalized = normalizeMarketEvent(event);
    if (normalized.source === 'hyperliquid') this.hyperliquid.push(normalized);
    else this.polymarket.push(normalized);

    const asset: Asset =
      normalized.source === 'hyperliquid' ? normalized.symbol : normalized.relevantAsset;
    const snapshot = calculateFeatureSnapshot({
      skill: this.skill,
      asset,
      asOf: new Date(normalized.sourceTimestamp),
      replayId: this.replayId,
      hyperliquid: this.hyperliquid,
      polymarket: this.polymarket,
    });
    const evaluation = evaluateSkill(this.skill, snapshot, this.replayId);
    let persisted: PipelineEventResult['persisted'] = null;
    if (evaluation.candidate && !this.emittedKeys.has(evaluation.candidate.candidateKey)) {
      this.emittedKeys.add(evaluation.candidate.candidateKey);
      persisted = await this.sink.persist(evaluation.candidate);
    }

    return {
      normalized,
      snapshot,
      rules: evaluation.rules,
      candidate: evaluation.candidate,
      persisted,
    };
  }
}
