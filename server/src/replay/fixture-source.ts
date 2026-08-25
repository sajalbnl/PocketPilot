import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  RawMarketEventSchema,
  type MarketEventSource,
  type RawMarketEvent,
} from '../market/raw-events.js';

const FIXTURE_ROOT = fileURLToPath(new URL('../../../fixtures/replay/', import.meta.url));
export const replayFixtureNames = ['btc-trigger', 'btc-followup', 'btc-no-trigger'] as const;
export type ReplayFixtureName = (typeof replayFixtureNames)[number];

export const ReplayMetadataSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    historical: z.literal(true),
    capturedAt: z.string().datetime({ offset: true }),
    attribution: z.array(
      z.object({ source: z.enum(['hyperliquid', 'polymarket']), url: z.string().url() }).strict(),
    ),
    note: z.string().min(1),
  })
  .strict();
export type ReplayMetadata = z.infer<typeof ReplayMetadataSchema>;

export class ReplayFixtureSource implements MarketEventSource {
  readonly id: string;
  readonly metadata: ReplayMetadata;

  private constructor(
    readonly fixtureName: ReplayFixtureName,
    metadata: ReplayMetadata,
    private readonly events: RawMarketEvent[],
  ) {
    this.id = metadata.id;
    this.metadata = metadata;
  }

  static async open(fixtureName: ReplayFixtureName): Promise<ReplayFixtureSource> {
    const prefix = `${FIXTURE_ROOT}${fixtureName}`;
    const [metadataSource, eventSource] = await Promise.all([
      readFile(`${prefix}.metadata.json`, 'utf8'),
      readFile(`${prefix}.jsonl`, 'utf8'),
    ]);
    const metadata = ReplayMetadataSchema.parse(JSON.parse(metadataSource));
    const events = eventSource
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        try {
          return RawMarketEventSchema.parse(JSON.parse(line));
        } catch (error: unknown) {
          throw new Error(`${fixtureName}.jsonl line ${index + 1}: ${String(error)}`, {
            cause: error,
          });
        }
      })
      .sort(
        (left, right) =>
          new Date(left.sourceTimestamp).getTime() - new Date(right.sourceTimestamp).getTime() ||
          left.sequence - right.sequence ||
          left.source.localeCompare(right.source),
      );
    return new ReplayFixtureSource(fixtureName, metadata, events);
  }

  async load(): Promise<readonly RawMarketEvent[]> {
    return this.events;
  }
}
