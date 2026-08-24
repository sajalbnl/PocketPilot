import type {
  ReasoningProvider,
  ReasoningProviderRequest,
  ReasoningProviderResponse,
} from './provider.js';

export class FixtureReasoningProvider implements ReasoningProvider {
  private cursor = 0;

  constructor(private readonly outputs: readonly string[] = []) {}

  generate(request: ReasoningProviderRequest): Promise<ReasoningProviderResponse> {
    const configured = this.outputs[this.cursor++];
    const lastMarket = request.context.evidence
      .filter((item) => item.source === 'hyperliquid')
      .at(-1);
    const entryReference = Number(lastMarket?.facts.markPrice);
    const stopPercent = request.context.skill.relevantInstructions.proposalDefaults.stop_loss_pct;
    const direction = request.context.candidate.direction;
    const stopLoss =
      direction === 'LONG'
        ? entryReference * (1 - stopPercent / 100)
        : entryReference * (1 + stopPercent / 100);
    const rawText =
      configured ??
      JSON.stringify({
        schemaVersion: 1,
        decision: 'PROPOSE',
        asset: request.context.candidate.asset,
        direction,
        venue: request.context.candidate.executionVenue,
        thesis:
          'Perpetual-market participation and liquid prediction-market repricing confirm the same near-term catalyst.',
        whyNow: [
          'All configured deterministic trigger rules passed in the bounded confirmation window.',
          'Price, volume, open interest, and prediction probability moved together.',
        ],
        evidenceReferences: request.context.evidence.map((item) => item.id),
        counterEvidence: [
          'The short confirmation window can reverse and prediction-market repricing may fade.',
        ],
        confidence: 0.78,
        proposedNotionalUsd:
          request.context.skill.relevantInstructions.proposalDefaults.notional_usd,
        leverage: request.context.skill.relevantInstructions.proposalDefaults.leverage,
        entryReference,
        stopLoss: Number(stopLoss.toFixed(8)),
        invalidationConditions: request.context.skill.relevantInstructions.invalidationGuidance,
        expiryMinutes: request.context.mandate.maxExpiryMinutes,
      });

    return Promise.resolve({
      rawText,
      provider: 'fixture',
      model: 'pocketpilot-deterministic-v1',
      responseId: null,
    });
  }
}
