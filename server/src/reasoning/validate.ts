import { AgentDecisionSchema, type AgentDecision } from '@pocketpilot/shared';

import type { ReasoningContext } from './prompt-v1.js';

export class ReasoningValidationError extends Error {
  constructor(
    readonly code:
      | 'MALFORMED_JSON'
      | 'SCHEMA_INVALID'
      | 'UNSUPPORTED_ASSET'
      | 'UNSUPPORTED_VENUE'
      | 'UNGROUNDED_EVIDENCE'
      | 'CANDIDATE_MISMATCH'
      | 'EXPIRY_OUT_OF_BOUNDS',
    message: string,
  ) {
    super(message);
    this.name = 'ReasoningValidationError';
  }
}

export function parseAndValidateDecision(
  rawText: string,
  context: ReasoningContext,
): AgentDecision {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new ReasoningValidationError('MALFORMED_JSON', 'Model output was not valid JSON');
  }
  const parsed = AgentDecisionSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ReasoningValidationError(
      'SCHEMA_INVALID',
      `Model output failed schema at ${issue?.path.join('.') || '<root>'}: ${issue?.message ?? 'invalid value'}`,
    );
  }
  const decision = parsed.data;
  if (!context.mandate.allowedAssets.includes(decision.asset)) {
    throw new ReasoningValidationError(
      'UNSUPPORTED_ASSET',
      'Model selected an asset outside the mandate',
    );
  }
  if (!context.mandate.allowedVenues.includes(decision.venue)) {
    throw new ReasoningValidationError(
      'UNSUPPORTED_VENUE',
      'Model selected a venue outside the mandate',
    );
  }
  if (
    decision.asset !== context.candidate.asset ||
    decision.direction !== context.candidate.direction
  ) {
    throw new ReasoningValidationError(
      'CANDIDATE_MISMATCH',
      'Model output changed the detected candidate asset or direction',
    );
  }
  const evidenceIds = new Set(context.evidence.map((item) => item.id));
  const unknownReference = decision.evidenceReferences.find((id) => !evidenceIds.has(id));
  if (unknownReference) {
    throw new ReasoningValidationError(
      'UNGROUNDED_EVIDENCE',
      `Model cited unknown evidence ID ${unknownReference.slice(0, 120)}`,
    );
  }
  if (
    decision.expiryMinutes !== null &&
    decision.expiryMinutes > context.mandate.maxExpiryMinutes
  ) {
    throw new ReasoningValidationError(
      'EXPIRY_OUT_OF_BOUNDS',
      `Model expiry exceeds the ${context.mandate.maxExpiryMinutes}-minute bound`,
    );
  }
  return decision;
}
