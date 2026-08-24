import {
  getSignalCategory,
  getSignalStatesForCategory,
  SignalDetailSchema,
  SignalListResponseSchema,
  type SignalDetail,
  type SignalListQuery,
  type SignalListResponse,
} from '@pocketpilot/shared';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { db } from './client.js';
import { signals } from './schema.js';

export type SignalRow = typeof signals.$inferSelect;

function proposalFields(row: SignalRow): {
  title: string | null;
  thesis: string | null;
  confidence: number | null;
} {
  if (row.llmOutput?.decision === 'PROPOSE_LONG' || row.llmOutput?.decision === 'PROPOSE_SHORT') {
    return {
      title: row.llmOutput.title,
      thesis: row.llmOutput.thesis,
      confidence: row.llmOutput.confidence,
    };
  }

  const summary = row.llmOutput && 'summary' in row.llmOutput ? row.llmOutput.summary : null;
  if (row.candidateKey) {
    return {
      title: `${row.symbol} cross-market catalyst detected`,
      thesis: 'Deterministic Hyperliquid and Polymarket thresholds aligned in the replay window.',
      confidence: null,
    };
  }
  return {
    title: summary,
    thesis: summary,
    confidence: null,
  };
}

export function mapSignalDetail(row: SignalRow): SignalDetail {
  const proposal = proposalFields(row);

  return SignalDetailSchema.parse({
    id: row.id,
    mandateId: row.mandateId,
    symbol: row.symbol,
    side: row.side,
    state: row.state,
    dataMode: row.dataMode,
    skillId: row.skillId,
    skillVersion: row.skillVersion,
    category: getSignalCategory(row.state),
    ...proposal,
    proposedNotionalUsd: row.proposedNotionalUsd,
    proposedLeverage: row.proposedLeverage,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    evidence: row.marketSnapshot,
    triggeredRules: row.triggeredRules,
    llmOutput: row.llmOutput,
    riskPreview: row.riskPreview,
    stopLossPrice: row.stopLossPrice,
    timeline: row.timeline,
  });
}

export async function listSignals(query: SignalListQuery): Promise<SignalListResponse> {
  const filters: SQL[] = [];
  if (query.state) filters.push(eq(signals.state, query.state));
  if (query.category) {
    filters.push(inArray(signals.state, [...getSignalStatesForCategory(query.category)]));
  }

  const rows = await db
    .select()
    .from(signals)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(signals.createdAt));
  const items = rows.map((row) => {
    const detail = mapSignalDetail(row);
    const {
      mandateId: _mandateId,
      evidence: _evidence,
      triggeredRules: _triggeredRules,
      llmOutput: _llmOutput,
      riskPreview: _riskPreview,
      stopLossPrice: _stopLossPrice,
      timeline: _timeline,
      ...item
    } = detail;
    void _mandateId;
    void _evidence;
    void _triggeredRules;
    void _llmOutput;
    void _riskPreview;
    void _stopLossPrice;
    void _timeline;
    return item;
  });

  return SignalListResponseSchema.parse({ signals: items, total: items.length });
}

export async function getSignalRow(id: string): Promise<SignalRow | null> {
  const [row] = await db.select().from(signals).where(eq(signals.id, id)).limit(1);
  return row ?? null;
}

export async function getSignal(id: string): Promise<SignalDetail | null> {
  const row = await getSignalRow(id);
  return row ? mapSignalDetail(row) : null;
}
