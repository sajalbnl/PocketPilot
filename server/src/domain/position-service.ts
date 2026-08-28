import {
  AssetSchema,
  ClosePositionResultSchema,
  PositionListResponseSchema,
  type ClosePositionResult,
  type PositionDetail,
  type PositionListResponse,
} from '@pocketpilot/shared';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { mapPositionDetail } from '../db/execution-repository.js';
import { orders, positions, signals } from '../db/schema.js';
import { ExecutionAdapterError, type ExecutionAdapter } from '../execution/adapter.js';
import { calculateUnrealizedPnl } from '../execution/paper-adapter.js';
import { appendSignalTransition } from './signal-transition-service.js';

export class PositionActionError extends Error {
  constructor(
    readonly code: 'POSITION_NOT_FOUND' | 'POSITION_CLOSE_FAILED' | 'ACTION_CONFLICT',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PositionActionError';
  }
}

export function derivePositionCloseClientOrderId(positionId: string, quantity: number): string {
  return `close:${positionId}:qty-${quantity.toFixed(12)}`;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export class PositionService {
  constructor(
    private readonly adapter: ExecutionAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<PositionListResponse> {
    const rows = await db
      .select({ position: positions, order: orders, signal: signals })
      .from(positions)
      .innerJoin(orders, eq(positions.orderId, orders.id))
      .innerJoin(signals, eq(orders.signalId, signals.id))
      .orderBy(desc(positions.createdAt));
    const marked = await Promise.all(rows.map((row) => this.mark(row)));
    return PositionListResponseSchema.parse({ positions: marked, total: marked.length });
  }

  async get(id: string): Promise<PositionDetail | null> {
    const [row] = await db
      .select({ position: positions, order: orders, signal: signals })
      .from(positions)
      .innerJoin(orders, eq(positions.orderId, orders.id))
      .innerJoin(signals, eq(orders.signalId, signals.id))
      .where(eq(positions.id, id))
      .limit(1);
    return row ? this.mark(row) : null;
  }

  async close(id: string): Promise<ClosePositionResult> {
    const outcome = await db.transaction(async (transaction) => {
      const [position] = await transaction
        .select()
        .from(positions)
        .where(eq(positions.id, id))
        .for('update')
        .limit(1);
      if (!position) throw new PositionActionError('POSITION_NOT_FOUND', 'Position was not found');
      const [order] = await transaction
        .select()
        .from(orders)
        .where(eq(orders.id, position.orderId))
        .limit(1);
      if (!order) throw new PositionActionError('ACTION_CONFLICT', 'Opening order was not found');
      const [signal] = await transaction
        .select()
        .from(signals)
        .where(eq(signals.id, order.signalId))
        .for('update')
        .limit(1);
      if (!signal) throw new PositionActionError('ACTION_CONFLICT', 'Linked signal was not found');

      if (position.status === 'CLOSED') {
        return ClosePositionResultSchema.parse({
          position: mapPositionDetail({ position, order, signal }),
          duplicate: true,
          message: 'This position was already closed; the existing result was returned.',
        });
      }
      if (signal.state !== 'FILLED') {
        throw new PositionActionError(
          'ACTION_CONFLICT',
          `A position linked to a ${signal.state.toLowerCase()} signal cannot be closed`,
        );
      }

      const symbol = AssetSchema.parse(position.symbol);
      const quote = await this.adapter.getCurrentPrice({
        symbol,
        evidence: signal.marketSnapshot,
        fallbackPrice: position.currentPrice,
      });
      // Quantity is persisted and changes only after a confirmed partial close. It therefore
      // gives retries of the same close attempt a stable ID while allowing a later attempt for
      // the remaining venue position to use a new ID.
      const clientOrderId = derivePositionCloseClientOrderId(position.id, position.quantity);
      let close;
      try {
        close = await this.adapter.closePosition({
          clientOrderId,
          symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          quantity: position.quantity,
          entryFeeUsd: position.entryFeeUsd,
          quote,
          evidence: signal.marketSnapshot,
          fallbackPrice: position.currentPrice,
        });
      } catch (error: unknown) {
        const adapterCode = error instanceof ExecutionAdapterError ? error.code : 'ADAPTER_FAILURE';
        throw new PositionActionError(
          'POSITION_CLOSE_FAILED',
          error instanceof Error ? error.message : 'Position close failed',
          { adapterCode },
        );
      }

      const now = this.now();
      const quantityTolerance = Math.max(1e-12, position.quantity * 1e-8);
      if (
        !Number.isFinite(close.quantity) ||
        close.quantity <= 0 ||
        close.quantity > position.quantity + quantityTolerance
      ) {
        throw new PositionActionError(
          'POSITION_CLOSE_FAILED',
          'The execution adapter returned an invalid close quantity; the local position was not changed.',
          { requestedQuantity: position.quantity, filledQuantity: close.quantity },
        );
      }

      const filledQuantity = Math.min(close.quantity, position.quantity);
      const remainingQuantity = round(position.quantity - filledQuantity, 12);
      if (remainingQuantity > quantityTolerance) {
        const remainingRatio = remainingQuantity / position.quantity;
        const remainingEntryFeeUsd = round(position.entryFeeUsd * remainingRatio, 8);
        const partialRealizedPnl = round((position.realizedPnl ?? 0) + close.realizedPnl, 8);
        const partialExitFeeUsd = round((position.exitFeeUsd ?? 0) + close.feeUsd, 8);
        const remainingNotionalUsd = Math.max(
          0.01,
          round(position.notionalUsd * remainingRatio, 2),
        );
        const unrealizedPnl = calculateUnrealizedPnl({
          side: position.side,
          entryPrice: position.entryPrice,
          currentPrice: close.fillPrice,
          quantity: remainingQuantity,
          entryFeeUsd: remainingEntryFeeUsd,
        });
        await transaction
          .update(positions)
          .set({
            currentPrice: close.fillPrice,
            notionalUsd: remainingNotionalUsd,
            quantity: remainingQuantity,
            entryFeeUsd: remainingEntryFeeUsd,
            exitFeeUsd: partialExitFeeUsd,
            unrealizedPnl,
            realizedPnl: partialRealizedPnl,
            updatedAt: now,
          })
          .where(eq(positions.id, position.id));

        // Return the error as the transaction result instead of throwing inside it: the partial
        // venue fill is real and its reduced local quantity must be committed before the caller
        // is told to retry the remaining close.
        return new PositionActionError(
          'POSITION_CLOSE_FAILED',
          `Hyperliquid testnet closed ${filledQuantity.toFixed(8)} ${position.symbol}, but ${remainingQuantity.toFixed(8)} ${position.symbol} remains open. The app has reconciled the remaining size; retry Close position to flatten it.`,
          {
            partialClose: true,
            filledQuantity,
            remainingQuantity,
            closeVenueOrderId: close.venueOrderId,
          },
        );
      }

      const totalExitFeeUsd = round((position.exitFeeUsd ?? 0) + close.feeUsd, 8);
      const totalRealizedPnl = round((position.realizedPnl ?? 0) + close.realizedPnl, 8);
      const [closedPosition] = await transaction
        .update(positions)
        .set({
          currentPrice: close.fillPrice,
          closePrice: close.fillPrice,
          closeClientOrderId: close.clientOrderId,
          closeVenueOrderId: close.venueOrderId,
          exitFeeUsd: totalExitFeeUsd,
          unrealizedPnl: 0,
          realizedPnl: totalRealizedPnl,
          status: 'CLOSED',
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(positions.id, position.id))
        .returning();
      if (!closedPosition) throw new Error('Position close update did not return a row');
      const closed = appendSignalTransition({
        currentState: 'FILLED',
        nextState: 'CLOSED',
        currentTimeline: signal.timeline,
        reason: 'User closed the position through its recorded execution adapter',
        occurredAt: now,
        metadata: {
          closeClientOrderId: clientOrderId,
          closeVenueOrderId: close.venueOrderId,
        },
      });
      await transaction
        .update(signals)
        .set({ ...closed, updatedAt: now })
        .where(eq(signals.id, signal.id));
      return ClosePositionResultSchema.parse({
        position: mapPositionDetail({
          position: closedPosition,
          order,
          signal: { ...signal, ...closed, updatedAt: now },
        }),
        duplicate: false,
        message: 'Position closed and realized PnL recorded.',
      });
    });
    if (outcome instanceof PositionActionError) throw outcome;
    return outcome;
  }

  private async mark(row: {
    position: typeof positions.$inferSelect;
    order: typeof orders.$inferSelect;
    signal: typeof signals.$inferSelect;
  }): Promise<PositionDetail> {
    if (row.position.status === 'CLOSED') return mapPositionDetail(row);
    const quote = await this.adapter.getCurrentPrice({
      symbol: AssetSchema.parse(row.position.symbol),
      evidence: row.signal.marketSnapshot,
      fallbackPrice: row.position.currentPrice,
    });
    const unrealizedPnl = calculateUnrealizedPnl({
      side: row.position.side,
      entryPrice: row.position.entryPrice,
      currentPrice: quote.price,
      quantity: row.position.quantity,
      entryFeeUsd: row.position.entryFeeUsd,
    });
    const [marked] = await db
      .update(positions)
      .set({ currentPrice: quote.price, unrealizedPnl, updatedAt: this.now() })
      .where(and(eq(positions.id, row.position.id), eq(positions.status, 'OPEN')))
      .returning();
    if (marked) return mapPositionDetail({ ...row, position: marked });
    const [current] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, row.position.id))
      .limit(1);
    return mapPositionDetail({ ...row, position: current ?? row.position });
  }
}
