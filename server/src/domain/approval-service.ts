import type { ApprovalRequest, RiskCode, RiskPreview, SignalDetail } from '@pocketpilot/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { getCurrentMandate } from '../db/mandate-repository.js';
import { getDailyRealizedLossUsd } from '../db/risk-repository.js';
import { getSignal, getSignalRow } from '../db/signal-repository.js';
import { signals } from '../db/schema.js';
import { evaluateRiskPolicy, firstFailedRiskRule } from '../risk/engine.js';
import { appendSignalTransition } from './signal-transition-service.js';

export class SignalActionError extends Error {
  constructor(
    readonly code: RiskCode | 'SIGNAL_NOT_FOUND' | 'MANDATE_NOT_FOUND' | 'ACTION_CONFLICT',
    message: string,
    readonly field?: string,
    readonly risk?: RiskPreview,
  ) {
    super(message);
    this.name = 'SignalActionError';
  }
}

export class ApprovalService {
  async approve(signalId: string, request: ApprovalRequest): Promise<SignalDetail> {
    const now = new Date();
    const [signal, mandate, dailyRealizedLossUsd] = await Promise.all([
      getSignalRow(signalId),
      getCurrentMandate(),
      getDailyRealizedLossUsd(now),
    ]);
    if (!signal) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    if (!mandate) throw new SignalActionError('MANDATE_NOT_FOUND', 'Current mandate was not found');
    if (signal.state !== 'PENDING_APPROVAL') {
      throw new SignalActionError(
        'INVALID_SIGNAL_STATE',
        `A ${signal.state.toLowerCase()} signal cannot be approved`,
      );
    }
    if (signal.llmOutput?.decision !== 'PROPOSE' || signal.llmOutput.entryReference === null) {
      throw new SignalActionError(
        'INVALID_SIGNAL_STATE',
        'This signal has no validated advisory proposal',
      );
    }

    const risk = evaluateRiskPolicy({
      phase: 'APPROVAL',
      order: {
        asset: signal.symbol,
        venue: signal.llmOutput.venue,
        direction: signal.side ?? signal.llmOutput.direction,
        notionalUsd: request.notionalUsd,
        leverage: request.leverage,
        entryReference: signal.llmOutput.entryReference,
        stopLossPrice: request.stopLossPrice,
        expiresAt: signal.expiresAt,
      },
      mandate,
      dailyRealizedLossUsd,
      explicitApprovalProvided: true,
      now,
    });

    if (!risk.allowed) {
      await db
        .update(signals)
        .set({ riskPreview: risk, updatedAt: now })
        .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)));
      const failed = firstFailedRiskRule(risk);
      if (!failed) throw new Error('Blocked risk result contained no failed rule');
      if (failed.code === 'SIGNAL_EXPIRED') {
        const expired = appendSignalTransition({
          currentState: signal.state,
          nextState: 'EXPIRED',
          currentTimeline: signal.timeline,
          reason: 'Approval-time risk evaluation found the signal expired',
        });
        await db
          .update(signals)
          .set({ ...expired, riskPreview: risk, updatedAt: now })
          .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)));
      }
      throw new SignalActionError(failed.code, failed.explanation, fieldForCode(failed.code), risk);
    }

    const approved = appendSignalTransition({
      currentState: signal.state,
      nextState: 'APPROVED',
      currentTimeline: signal.timeline,
      reason: 'Edited values passed current deterministic policy after explicit human approval',
      metadata: { approvalRevision: request.approvalRevision },
    });
    const updated = await db
      .update(signals)
      .set({
        ...approved,
        riskPreview: risk,
        proposedNotionalUsd: request.notionalUsd,
        proposedLeverage: request.leverage,
        stopLossPrice: request.stopLossPrice,
        updatedAt: now,
      })
      .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)))
      .returning({ id: signals.id });
    if (updated.length !== 1) {
      throw new SignalActionError('ACTION_CONFLICT', 'Signal state changed; refresh and try again');
    }

    const detail = await getSignal(signal.id);
    if (!detail) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    return detail;
  }

  async reject(signalId: string): Promise<SignalDetail> {
    const signal = await getSignalRow(signalId);
    if (!signal) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    if (signal.state !== 'PENDING_APPROVAL') {
      throw new SignalActionError(
        'INVALID_SIGNAL_STATE',
        `A ${signal.state.toLowerCase()} signal cannot be rejected`,
      );
    }

    const rejected = appendSignalTransition({
      currentState: signal.state,
      nextState: 'REJECTED',
      currentTimeline: signal.timeline,
      reason: 'User rejected the proposal from the mobile approval flow',
    });
    const updated = await db
      .update(signals)
      .set({ ...rejected, updatedAt: new Date() })
      .where(and(eq(signals.id, signal.id), eq(signals.state, signal.state)))
      .returning({ id: signals.id });
    if (updated.length !== 1) {
      throw new SignalActionError('ACTION_CONFLICT', 'Signal state changed; refresh and try again');
    }

    const detail = await getSignal(signal.id);
    if (!detail) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    return detail;
  }
}

function fieldForCode(code: RiskCode): string | undefined {
  if (code === 'MAX_NOTIONAL_EXCEEDED') return 'notionalUsd';
  if (code === 'MAX_LEVERAGE_EXCEEDED') return 'leverage';
  if (code === 'STOP_LOSS_REQUIRED' || code === 'STOP_LOSS_INVALID') return 'stopLossPrice';
  return undefined;
}
