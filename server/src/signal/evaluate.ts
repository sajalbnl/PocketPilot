import { createHash } from 'node:crypto';

import type { SignalEvidence } from '@pocketpilot/shared';

import type { InvestorSkill, RuleOperator } from '../skill/schema.js';
import type { FeatureSnapshot } from './features.js';

export interface RuleEvaluation {
  ruleId: string;
  feature: string;
  operator: RuleOperator;
  threshold: number;
  actual: number | null;
  passed: boolean;
}

export interface CandidateSignal {
  candidateKey: string;
  deterministicId: string;
  skillId: string;
  skillVersion: number;
  triggerVersion: number;
  symbol: FeatureSnapshot['asset'];
  side: 'LONG';
  detectedAt: string;
  replayId: string;
  triggeredRuleIds: string[];
  evidence: SignalEvidence;
}

function compare(actual: number, operator: RuleOperator, threshold: number): boolean {
  if (operator === 'gte') return actual >= threshold;
  if (operator === 'lte') return actual <= threshold;
  return actual === threshold;
}

export function buildCandidateKey(input: {
  skillId: string;
  skillVersion: number;
  triggerVersion: number;
  asset: string;
  windowId: string;
}): string {
  return [
    input.skillId,
    `skill-v${input.skillVersion}`,
    `trigger-v${input.triggerVersion}`,
    input.asset,
    input.windowId,
  ].join(':');
}

export function deterministicCandidateId(candidateKey: string): string {
  const hex = createHash('sha256').update(candidateKey).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  const variant = Number.parseInt(hex[16] ?? '0', 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function evaluateSkill(
  skill: InvestorSkill,
  snapshot: FeatureSnapshot,
  replayId: string,
): { candidate: CandidateSignal | null; rules: RuleEvaluation[] } {
  const rules = skill.trigger.require_all.map((rule): RuleEvaluation => {
    const actual = snapshot.values[rule.feature];
    return {
      ruleId: rule.id,
      feature: rule.feature,
      operator: rule.operator,
      threshold: rule.threshold,
      actual,
      passed: actual !== null && compare(actual, rule.operator, rule.threshold),
    };
  });
  if (!rules.every((rule) => rule.passed)) return { candidate: null, rules };

  const candidateKey = buildCandidateKey({
    skillId: skill.id,
    skillVersion: skill.version,
    triggerVersion: skill.trigger.version,
    asset: snapshot.asset,
    windowId: snapshot.windowId,
  });
  const evidence: SignalEvidence = {
    capturedAt: snapshot.asOf,
    hyperliquid: snapshot.hyperliquidEvidence,
    polymarket: snapshot.polymarketEvidence,
    featureSnapshot: {
      asOf: snapshot.asOf,
      windowStart: snapshot.windowStart,
      windowId: snapshot.windowId,
      values: snapshot.values,
      missingFeatures: snapshot.missingFeatures,
      ruleEvaluations: rules,
    },
  };
  return {
    rules,
    candidate: {
      candidateKey,
      deterministicId: deterministicCandidateId(candidateKey),
      skillId: skill.id,
      skillVersion: skill.version,
      triggerVersion: skill.trigger.version,
      symbol: snapshot.asset,
      side: skill.trigger.side,
      detectedAt: snapshot.asOf,
      replayId,
      triggeredRuleIds: rules.map((rule) => rule.ruleId),
      evidence,
    },
  };
}
