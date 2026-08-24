import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml, YAMLParseError } from 'yaml';

import { InvestorSkillSchema, type InvestorSkill } from './schema.js';

export const DEFAULT_SKILL_PATH = fileURLToPath(
  new URL('../../../skills/cross-market-catalyst/skill.yaml', import.meta.url),
);

export class InvestorSkillValidationError extends Error {
  constructor(
    readonly skillPath: string,
    details: string,
  ) {
    super(`Invalid Investor Skill at ${skillPath}: ${details}`);
    this.name = 'InvestorSkillValidationError';
  }
}

export function parseInvestorSkillSource(source: string, skillPath = '<inline>'): InvestorSkill {
  let document: unknown;
  try {
    document = parseYaml(source, { prettyErrors: true, uniqueKeys: true });
  } catch (error: unknown) {
    const detail = error instanceof YAMLParseError ? error.message : String(error);
    throw new InvestorSkillValidationError(skillPath, `malformed YAML: ${detail}`);
  }

  const parsed = InvestorSkillSchema.safeParse(document);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new InvestorSkillValidationError(skillPath, details);
  }
  return parsed.data;
}

export async function loadInvestorSkill(skillPath = DEFAULT_SKILL_PATH): Promise<InvestorSkill> {
  let source: string;
  try {
    source = await readFile(skillPath, 'utf8');
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new InvestorSkillValidationError(skillPath, `cannot read file: ${detail}`);
  }

  return parseInvestorSkillSource(source, skillPath);
}
