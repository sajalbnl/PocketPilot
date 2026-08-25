import { describe, expect, it } from 'vitest';

import { ReplayFixtureSource } from '../src/replay/fixture-source.js';
import { loadInvestorSkill } from '../src/skill/loader.js';
import { MarketSignalPipeline } from '../src/signal/pipeline.js';

describe('Replay Mode', () => {
  it('orders events deterministically by event time and fixture sequence', async () => {
    const source = await ReplayFixtureSource.open('btc-trigger');
    const first = await source.load();
    const second = await (await ReplayFixtureSource.open('btc-trigger')).load();
    expect(first.map((event) => event.payload.eventId)).toEqual([
      'hl-btc-100000',
      'pm-btc-100000',
      'hl-btc-100500',
      'pm-btc-100500',
      'hl-btc-mark-100600',
      'hl-btc-mark-100700',
    ]);
    expect(second).toEqual(first);
  });

  it('guarantees one trigger, suppresses the same window twice, and keeps the control quiet', async () => {
    const skill = await loadInvestorSkill();
    const trigger = await ReplayFixtureSource.open('btc-trigger');
    const persisted: string[] = [];
    const pipeline = new MarketSignalPipeline(skill, trigger.id, {
      persist: (candidate) => {
        persisted.push(candidate.candidateKey);
        return Promise.resolve({ signalId: candidate.deterministicId, created: true });
      },
    });
    const triggerEvents = await trigger.load();
    for (const event of triggerEvents) await pipeline.ingest(event);
    const lastEvent = triggerEvents.at(-1);
    if (!lastEvent) throw new Error('Trigger fixture is empty');
    await pipeline.ingest(lastEvent);
    expect(persisted).toHaveLength(1);

    const noTrigger = await ReplayFixtureSource.open('btc-no-trigger');
    let negativeCount = 0;
    const negativePipeline = new MarketSignalPipeline(skill, noTrigger.id, {
      persist: (candidate) => {
        void candidate;
        negativeCount += 1;
        return Promise.resolve({ signalId: 'none', created: true });
      },
    });
    for (const event of await noTrigger.load()) await negativePipeline.ingest(event);
    expect(negativeCount).toBe(0);
  });
});
