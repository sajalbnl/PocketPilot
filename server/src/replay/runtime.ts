import { getCurrentMandate } from '../db/mandate-repository.js';
import { persistCandidate, resetReplayCandidates } from '../db/candidate-repository.js';
import { loadInvestorSkill } from '../skill/loader.js';
import type { InvestorSkill } from '../skill/schema.js';
import { ReplayController } from './controller.js';

export async function createReplayController(
  loadedSkill?: InvestorSkill,
): Promise<ReplayController> {
  const skill = loadedSkill ?? (await loadInvestorSkill());
  const mandate = await getCurrentMandate();
  if (!mandate) {
    throw new Error('Replay Mode requires the demo mandate; run npm run db:seed first');
  }
  if (mandate.skillSlug !== skill.id) {
    throw new Error(
      `Mandate skill "${mandate.skillSlug}" does not match loaded Investor Skill "${skill.id}"`,
    );
  }
  return new ReplayController(
    skill,
    { persist: (candidate) => persistCandidate(mandate.id, candidate) },
    resetReplayCandidates,
  );
}
