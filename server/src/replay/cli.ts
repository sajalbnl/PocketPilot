import { closeDatabase } from '../db/client.js';
import { replayFixtureNames, type ReplayFixtureName } from './fixture-source.js';
import { createReplayController } from './runtime.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const controller = await createReplayController();
  if (command === 'reset') {
    const result = await controller.reset();
    console.log(`Replay reset complete: deleted ${result.deletedSignals} replay-created signal(s)`);
    return;
  }
  if (command !== 'run') throw new Error('Usage: replay <run|reset>');

  const fixtureValue = option('--fixture') ?? 'btc-trigger';
  if (!replayFixtureNames.includes(fixtureValue as ReplayFixtureName)) {
    throw new Error(`--fixture must be one of: ${replayFixtureNames.join(', ')}`);
  }
  const speed = Number(option('--speed') ?? '0');
  if (!Number.isFinite(speed) || speed < 0) throw new Error('--speed must be non-negative');
  const status = await controller.start({ fixture: fixtureValue as ReplayFixtureName, speed });
  console.log(
    [
      `Replay ${status.replayId} complete`,
      `events=${status.cursor}/${status.totalEvents}`,
      `created=${status.candidatesCreated}`,
      `deduplicated=${status.candidatesDeduplicated}`,
      `signals=${status.signalIds.join(',') || 'none'}`,
    ].join(' '),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
