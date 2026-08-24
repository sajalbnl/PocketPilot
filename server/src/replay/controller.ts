import type { InvestorSkill } from '../skill/schema.js';
import { MarketSignalPipeline, type CandidateSink } from '../signal/pipeline.js';
import { ReplayClock } from './clock.js';
import { ReplayFixtureSource, type ReplayFixtureName } from './fixture-source.js';

export interface ReplayStatus {
  state: 'idle' | 'ready' | 'running' | 'complete' | 'failed';
  fixture: ReplayFixtureName | null;
  replayId: string | null;
  cursor: number;
  totalEvents: number;
  clock: string | null;
  speed: number;
  candidatesCreated: number;
  candidatesDeduplicated: number;
  signalIds: string[];
  error: string | null;
}

export class ReplayController {
  private source: ReplayFixtureSource | null = null;
  private events: Awaited<ReturnType<ReplayFixtureSource['load']>> = [];
  private pipeline: MarketSignalPipeline | null = null;
  private clock = new ReplayClock();
  private busy = false;
  private statusValue: ReplayStatus = {
    state: 'idle',
    fixture: null,
    replayId: null,
    cursor: 0,
    totalEvents: 0,
    clock: null,
    speed: 0,
    candidatesCreated: 0,
    candidatesDeduplicated: 0,
    signalIds: [],
    error: null,
  };

  constructor(
    private readonly skill: InvestorSkill,
    private readonly sink: CandidateSink,
    private readonly resetCandidates: () => Promise<number>,
  ) {}

  status(): ReplayStatus {
    return { ...this.statusValue, signalIds: [...this.statusValue.signalIds] };
  }

  async start(input: {
    fixture: ReplayFixtureName;
    speed: number;
    stepOnly?: boolean;
  }): Promise<ReplayStatus> {
    if (this.busy) throw new Error('Replay is already running');
    this.source = await ReplayFixtureSource.open(input.fixture);
    this.events = await this.source.load();
    this.clock = new ReplayClock();
    this.pipeline = new MarketSignalPipeline(this.skill, this.source.id, this.sink);
    this.statusValue = {
      state: 'ready',
      fixture: input.fixture,
      replayId: this.source.id,
      cursor: 0,
      totalEvents: this.events.length,
      clock: null,
      speed: input.speed,
      candidatesCreated: 0,
      candidatesDeduplicated: 0,
      signalIds: [],
      error: null,
    };
    return input.stepOnly ? this.step() : this.runRemaining();
  }

  async step(): Promise<ReplayStatus> {
    if (this.busy) throw new Error('Replay is already running');
    if (!this.pipeline || !this.source) throw new Error('Start a replay before stepping it');
    if (this.statusValue.cursor >= this.events.length) {
      this.statusValue.state = 'complete';
      return this.status();
    }
    this.busy = true;
    this.statusValue.state = 'running';
    try {
      await this.processNext();
      this.statusValue.state =
        this.statusValue.cursor === this.events.length ? 'complete' : 'ready';
    } catch (error: unknown) {
      this.statusValue.state = 'failed';
      this.statusValue.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.busy = false;
    }
    return this.status();
  }

  async runRemaining(): Promise<ReplayStatus> {
    if (this.busy) throw new Error('Replay is already running');
    if (!this.pipeline || !this.source) throw new Error('Start a replay before running it');
    this.busy = true;
    this.statusValue.state = 'running';
    try {
      while (this.statusValue.cursor < this.events.length) await this.processNext();
      this.statusValue.state = 'complete';
    } catch (error: unknown) {
      this.statusValue.state = 'failed';
      this.statusValue.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.busy = false;
    }
    return this.status();
  }

  async reset(): Promise<{ deletedSignals: number; status: ReplayStatus }> {
    if (this.busy) throw new Error('Cannot reset while replay is running');
    const deletedSignals = await this.resetCandidates();
    this.source = null;
    this.events = [];
    this.pipeline = null;
    this.clock = new ReplayClock();
    this.statusValue = {
      ...this.statusValue,
      state: 'idle',
      fixture: null,
      replayId: null,
      cursor: 0,
      totalEvents: 0,
      clock: null,
      candidatesCreated: 0,
      candidatesDeduplicated: 0,
      signalIds: [],
      error: null,
    };
    return { deletedSignals, status: this.status() };
  }

  private async processNext(): Promise<void> {
    const event = this.events[this.statusValue.cursor];
    if (!event || !this.pipeline) throw new Error('Replay cursor is outside the loaded fixture');
    await this.clock.advanceTo(new Date(event.sourceTimestamp), this.statusValue.speed);
    const result = await this.pipeline.ingest(event);
    this.statusValue.cursor += 1;
    this.statusValue.clock = this.clock.now()?.toISOString() ?? null;
    if (result.persisted) {
      if (result.persisted.created) this.statusValue.candidatesCreated += 1;
      else this.statusValue.candidatesDeduplicated += 1;
      if (!this.statusValue.signalIds.includes(result.persisted.signalId)) {
        this.statusValue.signalIds.push(result.persisted.signalId);
      }
    }
  }
}
