import type {
  AgentDecision,
  CompactError,
  Mandate,
  ReasoningMetadata,
  SignalTimelineEntry,
} from '@pocketpilot/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { getCurrentMandate } from '../db/mandate-repository.js';
import { getDailyRealizedLossUsd } from '../db/risk-repository.js';
import { getSignalRow } from '../db/signal-repository.js';
import { signals } from '../db/schema.js';
import { appendSignalTransition } from '../domain/signal-transition-service.js';
import { evaluateRiskPolicy } from '../risk/engine.js';
import type { InvestorSkill } from '../skill/schema.js';
import type { PendingApprovalNotifier } from '../notification/service.js';
import {
  buildReasoningContext,
  REASONING_INSTRUCTIONS,
  REASONING_PROMPT_VERSION,
  type ReasoningContext,
} from './prompt-v1.js';
import type { ReasoningProvider, ReasoningProviderResponse } from './provider.js';
import { ReasoningProviderError } from './provider.js';
import { parseAndValidateDecision, ReasoningValidationError } from './validate.js';

export class SignalReasoningService {
  constructor(
    private readonly provider: ReasoningProvider,
    private readonly notifier: PendingApprovalNotifier = { notifyPendingApproval: async () => {} },
  ) {}

  async analyze(signalId: string, skill: InvestorSkill): Promise<void> {
    const [signal, mandate] = await Promise.all([getSignalRow(signalId), getCurrentMandate()]);
    if (!signal || signal.state !== 'DETECTED') return;
    if (!mandate) {
      await this.failSafely(
        { id: signal.id, state: 'DETECTED', timeline: signal.timeline },
        'MANDATE_NOT_FOUND',
        'Current mandate was not available for analysis',
        false,
      );
      return;
    }
    if (!signal.marketSnapshot || !signal.side) {
      await this.failSafely(
        { id: signal.id, state: 'DETECTED', timeline: signal.timeline },
        'CANDIDATE_CONTEXT_INVALID',
        'Candidate context is incomplete',
        false,
      );
      return;
    }

    const analyzing = appendSignalTransition({
      currentState: signal.state,
      nextState: 'ANALYZING',
      currentTimeline: signal.timeline,
      reason: 'Structured evidence sent across the advisory LLM reasoning boundary',
      metadata: { promptVersion: REASONING_PROMPT_VERSION },
    });
    const claimed = await db
      .update(signals)
      .set({ ...analyzing, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, 'DETECTED')))
      .returning({ id: signals.id });
    if (claimed.length !== 1) return;

    const analyzingSignal = {
      id: signal.id,
      state: 'ANALYZING' as const,
      timeline: analyzing.timeline,
    };
    try {
      const context = buildReasoningContext({
        skill,
        mandate,
        asset: signal.symbol,
        direction: signal.side,
        evidence: signal.marketSnapshot,
      });
      const reasoned = await this.reasonWithOneRepair(context);
      if (reasoned.decision.decision === 'NO_TRADE') {
        await this.persistNoTrade(analyzingSignal, reasoned.decision, reasoned.metadata);
        return;
      }
      await this.persistProposal(analyzingSignal, mandate, reasoned.decision, reasoned.metadata);
    } catch (error: unknown) {
      const compact = compactReasoningError(error);
      await this.failSafely(analyzingSignal, compact.code, compact.message, compact.retryable);
    }
  }

  private async reasonWithOneRepair(context: ReasoningContext): Promise<{
    decision: AgentDecision;
    metadata: ReasoningMetadata;
  }> {
    return generateValidatedDecision(this.provider, context);
  }

  private async persistNoTrade(
    signal: { id: string; state: 'ANALYZING'; timeline: SignalTimelineEntry[] },
    decision: AgentDecision,
    metadata: ReasoningMetadata,
  ): Promise<void> {
    const transition = appendSignalTransition({
      currentState: signal.state,
      nextState: 'NO_TRADE',
      currentTimeline: signal.timeline,
      reason: 'Validated evidence-bound reasoning returned NO_TRADE',
      metadata: { promptVersion: metadata.promptVersion, model: metadata.model },
    });
    await db
      .update(signals)
      .set({ ...transition, llmOutput: decision, llmMetadata: metadata, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, 'ANALYZING')));
  }

  private async persistProposal(
    signal: { id: string; state: 'ANALYZING'; timeline: SignalTimelineEntry[] },
    mandate: Mandate,
    decision: AgentDecision,
    metadata: ReasoningMetadata,
  ): Promise<void> {
    if (
      decision.proposedNotionalUsd === null ||
      decision.leverage === null ||
      decision.entryReference === null ||
      decision.stopLoss === null ||
      decision.expiryMinutes === null
    ) {
      throw new ReasoningValidationError('SCHEMA_INVALID', 'PROPOSE parameters are incomplete');
    }
    const proposedAt = new Date();
    const expiresAt = new Date(proposedAt.getTime() + decision.expiryMinutes * 60_000);
    const proposed = appendSignalTransition({
      currentState: signal.state,
      nextState: 'PROPOSED',
      currentTimeline: signal.timeline,
      reason: 'Schema-valid, evidence-grounded advisory proposal persisted',
      occurredAt: proposedAt,
      metadata: { promptVersion: metadata.promptVersion, model: metadata.model },
    });
    const stored = await db
      .update(signals)
      .set({
        ...proposed,
        side: decision.direction,
        llmOutput: decision,
        llmMetadata: metadata,
        reasoningError: null,
        proposedNotionalUsd: decision.proposedNotionalUsd,
        proposedLeverage: decision.leverage,
        stopLossPrice: decision.stopLoss,
        expiresAt,
        updatedAt: proposedAt,
      })
      .where(and(eq(signals.id, signal.id), eq(signals.state, 'ANALYZING')))
      .returning({ id: signals.id });
    if (stored.length !== 1) return;

    const dailyRealizedLossUsd = await getDailyRealizedLossUsd(proposedAt);
    const preview = evaluateRiskPolicy({
      phase: 'PRELIMINARY',
      order: {
        asset: decision.asset,
        venue: decision.venue,
        direction: decision.direction,
        notionalUsd: decision.proposedNotionalUsd,
        leverage: decision.leverage,
        entryReference: decision.entryReference,
        stopLossPrice: decision.stopLoss,
        expiresAt,
      },
      mandate,
      dailyRealizedLossUsd,
      explicitApprovalProvided: false,
      now: proposedAt,
    });
    const final = appendSignalTransition({
      currentState: 'PROPOSED',
      nextState: preview.allowed ? 'PENDING_APPROVAL' : 'RISK_BLOCKED',
      currentTimeline: proposed.timeline,
      reason: preview.allowed
        ? 'Preliminary deterministic risk policy passed; explicit approval is required'
        : 'Preliminary deterministic risk policy blocked the advisory proposal',
      metadata: { failedRules: preview.rules.filter((rule) => !rule.passed).length },
    });
    const finalized = await db
      .update(signals)
      .set({ ...final, riskPreview: preview, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, 'PROPOSED')))
      .returning({ id: signals.id, state: signals.state });
    if (finalized[0]?.state === 'PENDING_APPROVAL') {
      await this.notifier.notifyPendingApproval(finalized[0].id);
    }
  }

  private async failSafely(
    signal: {
      id: string;
      state: 'DETECTED' | 'ANALYZING';
      timeline: SignalTimelineEntry[];
    },
    code: string,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    const currentState = signal.state;
    const base =
      currentState === 'DETECTED'
        ? appendSignalTransition({
            currentState,
            nextState: 'ANALYZING',
            currentTimeline: signal.timeline,
            reason: 'Candidate analysis could not start with valid structured context',
          })
        : { state: currentState, timeline: signal.timeline };
    const failed = appendSignalTransition({
      currentState: 'ANALYZING',
      nextState: 'NO_TRADE',
      currentTimeline: base.timeline,
      reason: 'Reasoning failed validation; signal closed safely without an approvable proposal',
      metadata: { errorCode: code },
    });
    const reasoningError: CompactError = {
      code,
      message: message.slice(0, 240),
      occurredAt: new Date().toISOString(),
      retryable,
      metadata: {},
    };
    await db
      .update(signals)
      .set({ ...failed, reasoningError, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, currentState)));
  }
}

export async function generateValidatedDecision(
  provider: ReasoningProvider,
  context: ReasoningContext,
): Promise<{ decision: AgentDecision; metadata: ReasoningMetadata }> {
  let previous: ReasoningProviderResponse | null = null;
  let validation: ReasoningValidationError | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await provider.generate({
      instructions: REASONING_INSTRUCTIONS,
      context,
      ...(previous && validation
        ? {
            repair: {
              previousOutput: previous.rawText,
              validationError: `${validation.code}: ${validation.message}`,
            },
          }
        : {}),
    });
    try {
      const decision = parseAndValidateDecision(response.rawText, context);
      return {
        decision,
        metadata: {
          provider: response.provider,
          model: response.model,
          promptVersion: REASONING_PROMPT_VERSION,
          attempts: attempt,
          generatedAt: new Date().toISOString(),
          providerResponseId: response.responseId,
        },
      };
    } catch (error: unknown) {
      if (!(error instanceof ReasoningValidationError)) throw error;
      previous = response;
      validation = error;
      if (attempt === 2) throw error;
    }
  }
  throw new Error('Reasoning attempt loop exhausted');
}

function compactReasoningError(error: unknown): CompactError {
  if (error instanceof ReasoningProviderError || error instanceof ReasoningValidationError) {
    return {
      code: error.code,
      message: error.message,
      occurredAt: new Date().toISOString(),
      retryable: error instanceof ReasoningProviderError && error.retryable,
      metadata: {},
    };
  }
  return {
    code: 'REASONING_FAILED',
    message: error instanceof Error ? error.message : 'Reasoning failed',
    occurredAt: new Date().toISOString(),
    retryable: false,
    metadata: {},
  };
}
