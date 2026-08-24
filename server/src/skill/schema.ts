import { assets } from '@pocketpilot/shared';
import { z } from 'zod';

export const featureNames = [
  'price_return_pct',
  'volume_ratio',
  'funding_rate',
  'funding_change_bps',
  'open_interest_change_pct',
  'polymarket_probability_change_points',
  'polymarket_liquidity_usd',
  'source_recency_seconds',
  'evidence_completeness',
] as const;
export const FeatureNameSchema = z.enum(featureNames);
export type FeatureName = z.infer<typeof FeatureNameSchema>;

export const ruleOperators = ['gte', 'lte', 'eq'] as const;
export const RuleOperatorSchema = z.enum(ruleOperators);
export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

const FeatureDefinitionSchema = z
  .object({
    window_minutes: z.number().int().min(1).max(1_440),
    unit: z.enum([
      'percent',
      'ratio',
      'decimal_rate',
      'basis_points',
      'percentage_points',
      'usd',
      'seconds',
    ]),
    missing_data: z.literal('no_candidate'),
  })
  .strict();

const RangeSchema = z
  .object({ min: z.number().finite().nonnegative(), max: z.number().finite().positive() })
  .strict()
  .refine((range) => range.min <= range.max, { message: 'min must be less than or equal to max' });

const SkillRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    feature: FeatureNameSchema,
    operator: RuleOperatorSchema,
    threshold: z.number().finite(),
  })
  .strict();

export const InvestorSkillSchema = z
  .object({
    schema_version: z.literal(1),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: z.number().int().positive(),
    description: z.string().min(20).max(500),
    supported_assets: z.array(z.enum(assets)).min(1),
    required_sources: z.tuple([z.literal('hyperliquid'), z.literal('polymarket')]),
    features: z
      .object({
        price_return_pct: FeatureDefinitionSchema,
        volume_ratio: FeatureDefinitionSchema,
        funding_rate: FeatureDefinitionSchema,
        funding_change_bps: FeatureDefinitionSchema,
        open_interest_change_pct: FeatureDefinitionSchema,
        polymarket_probability_change_points: FeatureDefinitionSchema,
        polymarket_liquidity_usd: FeatureDefinitionSchema,
        source_recency_seconds: FeatureDefinitionSchema,
        evidence_completeness: FeatureDefinitionSchema,
      })
      .strict(),
    trigger: z
      .object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        version: z.number().int().positive(),
        side: z.literal('LONG'),
        require_all: z.array(SkillRuleSchema).min(1),
      })
      .strict(),
    proposal: z
      .object({
        defaults: z
          .object({
            notional_usd: z.number().finite().positive(),
            leverage: z.number().finite().positive(),
            stop_loss_pct: z.number().finite().positive(),
          })
          .strict(),
        bounds: z
          .object({
            notional_usd: RangeSchema,
            leverage: RangeSchema,
            stop_loss_pct: RangeSchema,
          })
          .strict(),
        expiry_minutes: z.number().int().min(1).max(60),
      })
      .strict(),
    evidence: z
      .object({
        minimum_hyperliquid_samples: z.number().int().min(2).max(100),
        minimum_polymarket_samples: z.number().int().min(2).max(100),
        require_same_asset_mapping: z.literal(true),
        include_source_identifiers: z.literal(true),
      })
      .strict(),
    invalidation_guidance: z.array(z.string().min(10).max(240)).min(1),
  })
  .strict()
  .superRefine((skill, context) => {
    const ids = new Set<string>();
    for (const [index, rule] of skill.trigger.require_all.entries()) {
      if (ids.has(rule.id)) {
        context.addIssue({
          code: 'custom',
          path: ['trigger', 'require_all', index, 'id'],
          message: `duplicate rule ID "${rule.id}"`,
        });
      }
      ids.add(rule.id);
    }

    for (const name of ['notional_usd', 'leverage', 'stop_loss_pct'] as const) {
      const value = skill.proposal.defaults[name];
      const bounds = skill.proposal.bounds[name];
      if (value < bounds.min || value > bounds.max) {
        context.addIssue({
          code: 'custom',
          path: ['proposal', 'defaults', name],
          message: `must be inside configured bounds ${bounds.min}..${bounds.max}`,
        });
      }
    }

    const thresholdRanges: Partial<Record<FeatureName, [number, number]>> = {
      evidence_completeness: [0, 1],
      funding_rate: [-1, 1],
      polymarket_probability_change_points: [-100, 100],
      source_recency_seconds: [0, 86_400],
      polymarket_liquidity_usd: [0, Number.MAX_SAFE_INTEGER],
      volume_ratio: [0, Number.MAX_SAFE_INTEGER],
    };
    for (const [index, rule] of skill.trigger.require_all.entries()) {
      const range = thresholdRanges[rule.feature];
      if (range && (rule.threshold < range[0] || rule.threshold > range[1])) {
        context.addIssue({
          code: 'custom',
          path: ['trigger', 'require_all', index, 'threshold'],
          message: `threshold for ${rule.feature} must be in ${range[0]}..${range[1]}`,
        });
      }
    }
  });

export type InvestorSkill = z.infer<typeof InvestorSkillSchema>;
