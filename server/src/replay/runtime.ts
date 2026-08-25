import { getCurrentMandate } from '../db/mandate-repository.js';
import { persistCandidate, resetReplayCandidates } from '../db/candidate-repository.js';
import { loadInvestorSkill } from '../skill/loader.js';
import type { InvestorSkill } from '../skill/schema.js';
import { createReasoningProvider } from '../reasoning/factory.js';
import { SignalReasoningService } from '../reasoning/service.js';
import { ReplayController } from './controller.js';
import type { NormalizedMarketSample } from '@pocketpilot/shared';

export async function createReplayController(
  loadedSkill?: InvestorSkill,
  reasoningService = new SignalReasoningService(createReasoningProvider()),
  marketObserver?: {
    ingest(sample: NormalizedMarketSample): void;
    reset(): void;
  },
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
    {
      persist: async (candidate) => {
        const persisted = await persistCandidate(mandate.id, candidate);
        if (persisted.created) await reasoningService.analyze(persisted.signalId, skill);
        return persisted;
      },
    },
    resetReplayCandidates,
    (sample) => marketObserver?.ingest(sample),
    () => marketObserver?.reset(),
  );
}
