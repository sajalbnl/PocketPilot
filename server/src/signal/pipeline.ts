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
    private readonly timing: { freshnessSeconds?: number; alignmentSeconds?: number } = {},
  ) {}

  async ingest(event: RawMarketEvent): Promise<PipelineEventResult> {
    const normalized = normalizeMarketEvent(event);
    if (normalized.source === 'hyperliquid') this.hyperliquid.push(normalized);
    else this.polymarket.push(normalized);
    this.pruneHistory(new Date(normalized.sourceTimestamp).getTime());

    const asset: Asset =
      normalized.source === 'hyperliquid' ? normalized.symbol : normalized.relevantAsset;
    const snapshot = calculateFeatureSnapshot({
      skill: this.skill,
      asset,
      asOf: new Date(normalized.sourceTimestamp),
      replayId: this.replayId,
      hyperliquid: this.hyperliquid,
      polymarket: this.polymarket,
      ...this.timing,
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

  private pruneHistory(asOfMs: number): void {
    const featureWindowMs =
      Math.max(
        ...Object.values(this.skill.features).map((definition) => definition.window_minutes),
      ) * 60_000;
    const safetyWindowMs =
      Math.max(this.timing.freshnessSeconds ?? 120, this.timing.alignmentSeconds ?? 120) * 1_000;
    const cutoff = asOfMs - featureWindowMs - safetyWindowMs;
    const keep = (sample: { sourceTimestamp: string }) =>
      new Date(sample.sourceTimestamp).getTime() >= cutoff;
    this.hyperliquid.splice(0, this.hyperliquid.length, ...this.hyperliquid.filter(keep));
    this.polymarket.splice(0, this.polymarket.length, ...this.polymarket.filter(keep));
  }
}
