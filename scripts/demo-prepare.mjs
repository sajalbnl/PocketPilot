import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`Demo preparation stopped: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function readEnvironment(path) {
  const entries = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) fail('Node.js 22 or newer is required.');
if (!existsSync(resolve(root, 'node_modules'))) fail('dependencies are missing; run npm ci first.');
if (!existsSync(resolve(root, '.env'))) fail('copy .env.example to .env and review it first.');
if (!existsSync(resolve(root, 'app/.env'))) {
  fail('copy app/.env.example to app/.env and set the reachable API URL first.');
}

const environment = readEnvironment(resolve(root, '.env'));
const dataMode = environment.get('DATA_MODE') || 'replay';
const executionMode = environment.get('EXECUTION_MODE') || 'paper';
if (dataMode !== 'replay' || executionMode !== 'paper') {
  fail(
    `the guaranteed rehearsal requires DATA_MODE=replay and EXECUTION_MODE=paper (found ${dataMode}/${executionMode}).`,
  );
}

console.log(
  `Preparing the guaranteed ${dataMode}/${executionMode} demo on Node ${process.versions.node}.`,
);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'db:seed']);
run('npm', ['run', 'demo:reset']);

const metadata = JSON.parse(
  readFileSync(resolve(root, 'fixtures/replay/btc-trigger.metadata.json'), 'utf8'),
);
console.log('Demo data is clean and the $100 / 3x / $25 mandate is seeded.');
console.log(`Expected trigger: ${metadata.title ?? 'BTC cross-market catalyst'}.`);
console.log('Next terminal 1: npm run dev:server');
console.log('Next terminal 2: npm run start:dev-client -w @pocketpilot/app');
console.log(
  'After the phone is ready: curl -X POST http://localhost:3000/dev/replay/start -H "content-type: application/json" -d \'{"fixture":"btc-trigger","speed":0,"stepOnly":true}\'',
);
console.log(
  'Then run this exactly three times: curl -X POST http://localhost:3000/dev/replay/step',
);
console.log('This creates the signal while preserving the two queued PnL marks for the demo.');
