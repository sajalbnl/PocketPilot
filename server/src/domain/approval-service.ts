import {
  ApprovalExecutionResultSchema,
  AssetSchema,
  type AdapterErrorCode,
  type ApprovalExecutionResult,
  type ApprovalRequest,
  type CompactError,
  type RiskCode,
  type RiskPreview,
  type SignalDetail,
} from '@pocketpilot/shared';
import { and, eq, gte } from 'drizzle-orm';

import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { mapOrder, mapPositionDetail } from '../db/execution-repository.js';
import { mapMandate } from '../db/mandate-repository.js';
import { mandates, orders, positions, signals } from '../db/schema.js';
import { getSignal } from '../db/signal-repository.js';
import { ExecutionAdapterError, type ExecutionAdapter } from '../execution/adapter.js';
import { evaluateRiskPolicy, firstFailedRiskRule } from '../risk/engine.js';
import { appendSignalTransition } from './signal-transition-service.js';

type ActionCode =
  | RiskCode
  | AdapterErrorCode
  | 'SIGNAL_NOT_FOUND'
  | 'MANDATE_NOT_FOUND'
  | 'ACTION_CONFLICT'
  | 'EXECUTION_FAILED';

export class SignalActionError extends Error {
  constructor(
    readonly code: ActionCode,
    message: string,
    readonly field?: string,
    readonly risk?: RiskPreview,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SignalActionError';
  }
}

type ApprovalOutcome =
  | { kind: 'success'; result: ApprovalExecutionResult }
  | { kind: 'blocked'; error: SignalActionError }
  | { kind: 'failed'; error: SignalActionError };

export function deriveApprovalKey(signalId: string, approvalRevision: number): string {
  return `${signalId}:approval-r${approvalRevision}`;
}

export class ApprovalService {
  constructor(
    private readonly adapter: ExecutionAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async approve(signalId: string, request: ApprovalRequest): Promise<ApprovalExecutionResult> {
    const approvalKey = deriveApprovalKey(signalId, request.approvalRevision);
    const outcome = await db.transaction(async (transaction): Promise<ApprovalOutcome> => {
      const [signal] = await transaction
        .select()
        .from(signals)
        .where(eq(signals.id, signalId))
        .for('update')
        .limit(1);
      if (!signal) {
        return {
          kind: 'blocked',
          error: new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found'),
        };
      }

      const [existingOrder] = await transaction
        .select()
        .from(orders)
        .where(eq(orders.approvalKey, approvalKey))
        .limit(1);
      if (existingOrder) {
        const [existingPosition] = await transaction
          .select()
          .from(positions)
          .where(eq(positions.orderId, existingOrder.id))
          .limit(1);
        if (existingOrder.status === 'FILLED' && existingPosition) {
          return {
            kind: 'success',
            result: ApprovalExecutionResultSchema.parse({
              allowed: true,
              approvalKey,
              duplicate: true,
              order: mapOrder(existingOrder),
              position: mapPositionDetail({
                position: existingPosition,
                order: existingOrder,
                signal,
              }),
              message: 'This approval revision already filled; the existing position was returned.',
            }),
          };
        }
        return {
          kind: 'failed',
          error: new SignalActionError(
            'EXECUTION_FAILED',
            existingOrder.error?.message ?? 'This approval revision previously failed execution',
            undefined,
            undefined,
            { order: mapOrder(existingOrder) },
          ),
        };
      }

      if (signal.state !== 'PENDING_APPROVAL') {
        return {
          kind: 'blocked',
          error: new SignalActionError(
            'INVALID_SIGNAL_STATE',
            `A ${signal.state.toLowerCase()} signal cannot be approved`,
          ),
        };
      }
      if (signal.llmOutput?.decision !== 'PROPOSE' || signal.llmOutput.entryReference === null) {
        return {
          kind: 'blocked',
          error: new SignalActionError(
            'INVALID_SIGNAL_STATE',
            'This signal has no validated advisory proposal',
          ),
        };
      }

      const [mandateRow] = await transaction
        .select()
        .from(mandates)
        .where(eq(mandates.id, signal.mandateId))
        .for('update')
        .limit(1);
      if (!mandateRow) {
        return {
          kind: 'blocked',
          error: new SignalActionError('MANDATE_NOT_FOUND', 'Current mandate was not found'),
        };
      }
      const mandate = mapMandate(mandateRow);
      const symbol = AssetSchema.parse(signal.symbol);
      const side = signal.side ?? signal.llmOutput.direction;
      const now = this.now();
      let quote;
      try {
        quote = await this.adapter.getCurrentPrice({
          symbol,
          evidence: signal.marketSnapshot,
          fallbackPrice: signal.llmOutput.entryReference,
        });
      } catch (error: unknown) {
        if (error instanceof ExecutionAdapterError) {
          return {
            kind: 'failed',
            error: new SignalActionError(error.code, error.message, undefined, undefined, {
              retryable: error.retryable,
              adapterMetadata: error.metadata,
            }),
          };
        }
        throw error;
      }
      const dailyRealizedLossUsd = await dailyLossInTransaction(transaction, now);
      const riskInput = {
        phase: 'APPROVAL' as const,
        order: {
          asset: signal.symbol,
          venue: signal.llmOutput.venue,
          direction: side,
          notionalUsd: request.notionalUsd,
          leverage: request.leverage,
          entryReference: quote.price,
          stopLossPrice: request.stopLossPrice,
          expiresAt: signal.expiresAt,
        },
        mandate,
        dailyRealizedLossUsd,
        explicitApprovalProvided: true,
        now,
      };
      const risk = evaluateRiskPolicy(riskInput);
      if (!risk.allowed) {
        const failed = firstFailedRiskRule(risk);
        if (!failed) throw new Error('Blocked risk result contained no failed rule');
        const expired =
          failed.code === 'SIGNAL_EXPIRED'
            ? appendSignalTransition({
                currentState: signal.state,
                nextState: 'EXPIRED',
                currentTimeline: signal.timeline,
                reason: 'Approval-time risk evaluation found the signal expired',
                occurredAt: now,
              })
            : { state: signal.state, timeline: signal.timeline };
        await transaction
          .update(signals)
          .set({ ...expired, riskPreview: risk, updatedAt: now })
          .where(eq(signals.id, signal.id));
        return {
          kind: 'blocked',
          error: new SignalActionError(
            failed.code,
            failed.explanation,
            fieldForCode(failed.code),
            risk,
          ),
        };
      }

      const approved = appendSignalTransition({
        currentState: signal.state,
        nextState: 'APPROVED',
        currentTimeline: signal.timeline,
        reason: 'Edited values passed current deterministic policy after explicit human approval',
        occurredAt: now,
        metadata: {
          approvalRevision: request.approvalRevision,
          ...(request.requestKey ? { requestKey: request.requestKey } : {}),
        },
      });
      await transaction
        .update(signals)
        .set({
          ...approved,
          riskPreview: risk,
          proposedNotionalUsd: request.notionalUsd,
          proposedLeverage: request.leverage,
          stopLossPrice: request.stopLossPrice,
          updatedAt: now,
        })
        .where(eq(signals.id, signal.id));

      const [pendingOrder] = await transaction
        .insert(orders)
        .values({
          signalId: signal.id,
          approvalKey,
          clientOrderId: approvalKey,
          executionMode: env.EXECUTION_MODE,
          side,
          notionalUsd: request.notionalUsd,
          leverage: request.leverage,
          requestedPrice: quote.price,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!pendingOrder) throw new Error('Order insert did not return a row');

      // This is intentionally a second full policy evaluation. The mandate row remains locked,
      // so a kill-switch update cannot commit between this check and the local paper fill.
      const executionNow = this.now();
      const executionRisk = evaluateRiskPolicy({ ...riskInput, now: executionNow });
      if (!executionRisk.allowed) {
        const failed = firstFailedRiskRule(executionRisk);
        if (!failed) throw new Error('Blocked execution risk result contained no failed rule');
        const terminal = appendSignalTransition({
          currentState: 'APPROVED',
          nextState: failed.code === 'SIGNAL_EXPIRED' ? 'EXPIRED' : 'RISK_BLOCKED',
          currentTimeline: approved.timeline,
          reason: 'Immediate pre-execution policy check blocked the approved order',
          occurredAt: executionNow,
          metadata: { riskCode: failed.code },
        });
        const compact: CompactError = {
          code: failed.code,
          message: failed.explanation,
          occurredAt: executionNow.toISOString(),
          retryable: false,
          metadata: {},
        };
        await transaction
          .update(signals)
          .set({ ...terminal, riskPreview: executionRisk, updatedAt: executionNow })
          .where(eq(signals.id, signal.id));
        await transaction
          .update(orders)
          .set({ status: 'CANCELLED', error: compact, updatedAt: executionNow })
          .where(eq(orders.id, pendingOrder.id));
        return {
          kind: 'blocked',
          error: new SignalActionError(
            failed.code,
            failed.explanation,
            fieldForCode(failed.code),
            executionRisk,
          ),
        };
      }

      const executing = appendSignalTransition({
        currentState: 'APPROVED',
        nextState: 'EXECUTING',
        currentTimeline: approved.timeline,
        reason: 'Server authority submitted the approved order through the execution adapter',
        occurredAt: executionNow,
        metadata: { clientOrderId: approvalKey, executionMode: env.EXECUTION_MODE },
      });
      await transaction
        .update(signals)
        .set({ ...executing, riskPreview: executionRisk, updatedAt: executionNow })
        .where(eq(signals.id, signal.id));
      await transaction
        .update(orders)
        .set({ status: 'SUBMITTED', updatedAt: executionNow })
        .where(eq(orders.id, pendingOrder.id));

      let execution;
      try {
        if (request.stopLossPrice === null) throw new Error('Approved stop-loss is missing');
        execution = await this.adapter.submitMarketOrder({
          clientOrderId: approvalKey,
          symbol,
          side,
          notionalUsd: request.notionalUsd,
          leverage: request.leverage,
          stopLossPrice: request.stopLossPrice,
          quote,
          evidence: signal.marketSnapshot,
          fallbackPrice: signal.llmOutput.entryReference,
        });
      } catch (error: unknown) {
        const compact = compactExecutionError(error, executionNow);
        const failed = appendSignalTransition({
          currentState: 'EXECUTING',
          nextState: 'EXECUTION_FAILED',
          currentTimeline: executing.timeline,
          reason: 'Execution adapter failed; no position was created',
          occurredAt: executionNow,
          metadata: { errorCode: compact.code },
        });
        const [failedOrder] = await transaction
          .update(orders)
          .set({ status: 'FAILED', error: compact, updatedAt: executionNow })
          .where(eq(orders.id, pendingOrder.id))
          .returning();
        await transaction
          .update(signals)
          .set({ ...failed, updatedAt: executionNow })
          .where(eq(signals.id, signal.id));
        return {
          kind: 'failed',
          error: new SignalActionError(
            'EXECUTION_FAILED',
            compact.message,
            undefined,
            undefined,
            failedOrder ? { order: mapOrder(failedOrder) } : undefined,
          ),
        };
      }

      const filledAt = new Date(execution.executedAt);
      const [filledOrder] = await transaction
        .update(orders)
        .set({
          venueOrderId: execution.venueOrderId,
          requestedPrice: execution.requestedPrice,
          fillPrice: execution.fillPrice,
          quantity: execution.quantity,
          feeUsd: execution.feeUsd,
          slippageBps: execution.slippageBps,
          status: 'FILLED',
          error: null,
          filledAt,
          updatedAt: executionNow,
        })
        .where(eq(orders.id, pendingOrder.id))
        .returning();
      if (!filledOrder || request.stopLossPrice === null) {
        throw new Error('Filled order persistence failed');
      }
      const initialUnrealized =
        (side === 'LONG' ? 1 : -1) * execution.quantity * (quote.price - execution.fillPrice) -
        execution.feeUsd;
      const [position] = await transaction
        .insert(positions)
        .values({
          orderId: filledOrder.id,
          symbol,
          side,
          entryPrice: execution.fillPrice,
          currentPrice: quote.price,
          notionalUsd: request.notionalUsd,
          leverage: request.leverage,
          quantity: execution.quantity,
          stopLossPrice: request.stopLossPrice,
          entryFeeUsd: execution.feeUsd,
          unrealizedPnl: Number(initialUnrealized.toFixed(8)),
          status: 'OPEN',
          createdAt: executionNow,
          updatedAt: executionNow,
        })
        .returning();
      if (!position) throw new Error('Position insert did not return a row');

      const filled = appendSignalTransition({
        currentState: 'EXECUTING',
        nextState: 'FILLED',
        currentTimeline: executing.timeline,
        reason: `Execution adapter returned one complete ${env.EXECUTION_MODE} fill and one position was created`,
        occurredAt: executionNow,
        metadata: {
          venueOrderId: execution.venueOrderId,
          positionId: position.id,
          protectiveStopPlaced: false,
        },
      });
      await transaction
        .update(signals)
        .set({ ...filled, updatedAt: executionNow })
        .where(eq(signals.id, signal.id));

      const filledSignal = { ...signal, ...filled, updatedAt: executionNow };
      return {
        kind: 'success',
        result: ApprovalExecutionResultSchema.parse({
          allowed: true,
          approvalKey,
          duplicate: false,
          order: mapOrder(filledOrder),
          position: mapPositionDetail({ position, order: filledOrder, signal: filledSignal }),
          message: `Approval passed, one ${env.EXECUTION_MODE} order filled, and one position was created.`,
        }),
      };
    });

    if (outcome.kind !== 'success') throw outcome.error;
    return outcome.result;
  }

  async reject(signalId: string, reason?: string): Promise<SignalDetail> {
    const rejectedId = await db.transaction(async (transaction) => {
      const [signal] = await transaction
        .select()
        .from(signals)
        .where(eq(signals.id, signalId))
        .for('update')
        .limit(1);
      if (!signal) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
      if (signal.state !== 'PENDING_APPROVAL') {
        throw new SignalActionError(
          'INVALID_SIGNAL_STATE',
          `A ${signal.state.toLowerCase()} signal cannot be rejected`,
        );
      }
      const now = this.now();
      const rejected = appendSignalTransition({
        currentState: signal.state,
        nextState: 'REJECTED',
        currentTimeline: signal.timeline,
        reason: reason ?? 'User rejected the proposal from the mobile approval flow',
        occurredAt: now,
        metadata: { rejectedBy: 'human' },
      });
      await transaction
        .update(signals)
        .set({ ...rejected, updatedAt: now })
        .where(eq(signals.id, signal.id));
      return signal.id;
    });

    const detail = await getSignal(rejectedId);
    if (!detail) throw new SignalActionError('SIGNAL_NOT_FOUND', 'Signal was not found');
    return detail;
  }
}

async function dailyLossInTransaction(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  now: Date,
): Promise<number> {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const rows = await transaction
    .select({ realizedPnl: positions.realizedPnl })
    .from(positions)
    .where(and(eq(positions.status, 'CLOSED'), gte(positions.closedAt, dayStart)));
  const net = rows.reduce((total, row) => total + (row.realizedPnl ?? 0), 0);
  return Math.max(0, -net);
}

function compactExecutionError(error: unknown, occurredAt: Date): CompactError {
  if (error instanceof ExecutionAdapterError) {
    return {
      code: error.code,
      message: error.message.slice(0, 240),
      occurredAt: occurredAt.toISOString(),
      retryable: error.retryable,
      metadata: error.metadata,
    };
  }
  return {
    code: 'ADAPTER_FAILURE',
    message: (error instanceof Error ? error.message : 'Execution adapter failed').slice(0, 240),
    occurredAt: occurredAt.toISOString(),
    retryable: false,
    metadata: {},
  };
}

function fieldForCode(code: RiskCode): string | undefined {
  if (code === 'MAX_NOTIONAL_EXCEEDED') return 'notionalUsd';
  if (code === 'MAX_LEVERAGE_EXCEEDED') return 'leverage';
  if (code === 'STOP_LOSS_REQUIRED' || code === 'STOP_LOSS_INVALID') return 'stopLossPrice';
  return undefined;
}
