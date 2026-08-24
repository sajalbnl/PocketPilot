import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SKILL_PATH,
  InvestorSkillValidationError,
  loadInvestorSkill,
  parseInvestorSkillSource,
} from '../src/skill/loader.js';

describe('Investor Skill loader', () => {
  it('loads the pitch-readable skill into a typed representation', async () => {
    const skill = await loadInvestorSkill();
    expect(skill.id).toBe('cross-market-catalyst');
    expect(skill.version).toBe(1);
    expect(skill.trigger.require_all).toHaveLength(8);
  });

  it('rejects unknown critical fields with an actionable path', async () => {
    const source = await readFile(DEFAULT_SKILL_PATH, 'utf8');
    expect(() => parseInvestorSkillSource(`${source}\nunknown_switch: true\n`, 'bad.yaml')).toThrow(
      /bad\.yaml.*Unrecognized key.*unknown_switch/u,
    );
  });

  it('rejects malformed YAML and unsupported operators', async () => {
    expect(() => parseInvestorSkillSource('id: [', 'broken.yaml')).toThrow(
      InvestorSkillValidationError,
    );
    const source = await readFile(DEFAULT_SKILL_PATH, 'utf8');
    expect(() => parseInvestorSkillSource(source.replace('operator: gte', 'operator: gt'))).toThrow(
      /trigger\.require_all\.0\.operator/u,
    );
  });
});
