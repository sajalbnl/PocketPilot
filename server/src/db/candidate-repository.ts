import { and, eq, isNotNull } from 'drizzle-orm';

import type { CandidateSignal } from '../signal/evaluate.js';
import { db } from './client.js';
import { signals } from './schema.js';

export interface CandidatePersistenceResult {
  signalId: string;
  created: boolean;
}

export async function persistCandidate(
  mandateId: string,
  candidate: CandidateSignal,
): Promise<CandidatePersistenceResult> {
  const detectedAt = new Date(candidate.detectedAt);
  const inserted = await db
    .insert(signals)
    .values({
      id: candidate.deterministicId,
      mandateId,
      symbol: candidate.symbol,
      side: candidate.side,
      state: 'DETECTED',
      dataMode: 'replay',
      skillId: candidate.skillId,
      skillVersion: candidate.skillVersion,
      candidateKey: candidate.candidateKey,
      marketSnapshot: candidate.evidence,
      triggeredRules: candidate.triggeredRuleIds,
      timeline: [
        {
          fromState: null,
          toState: 'DETECTED',
          occurredAt: candidate.detectedAt,
          reason: 'Deterministic Investor Skill thresholds matched replay evidence',
          metadata: {
            replayId: candidate.replayId,
            skillId: candidate.skillId,
            skillVersion: candidate.skillVersion,
            triggerVersion: candidate.triggerVersion,
          },
        },
      ],
      createdAt: detectedAt,
      updatedAt: detectedAt,
    })
    .onConflictDoNothing({ target: signals.candidateKey })
    .returning({ id: signals.id });

  return { signalId: inserted[0]?.id ?? candidate.deterministicId, created: inserted.length === 1 };
}

export async function resetReplayCandidates(): Promise<number> {
  const deleted = await db
    .delete(signals)
    .where(and(eq(signals.dataMode, 'replay'), isNotNull(signals.candidateKey)))
    .returning({ id: signals.id });
  return deleted.length;
}
