import { createServer } from 'node:http';

import { env } from './config/env.js';
import { closeDatabase } from './db/client.js';
import { createApp } from './http/app.js';

const server = createServer(createApp());
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received; shutting down gracefully`);

  server.close(async (serverError) => {
    try {
      await closeDatabase();
    } catch (databaseError: unknown) {
      console.error('Failed to close the database pool', databaseError);
      process.exitCode = 1;
    }

    if (serverError) {
      console.error('HTTP server shutdown failed', serverError);
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

server.listen(env.PORT, () => {
  console.log(
    `pocketpilot server listening on port ${env.PORT} (${env.DATA_MODE}/${env.EXECUTION_MODE})`,
  );
});

server.on('error', (error) => {
  console.error('HTTP server failed', error);
  process.exitCode = 1;
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
