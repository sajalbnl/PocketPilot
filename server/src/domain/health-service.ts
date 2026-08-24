import { sql } from 'drizzle-orm';

import { db } from '../db/client.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: string;
}

export class HealthService {
  async check(): Promise<HealthReport> {
    try {
      await db.execute(sql`select 1`);
      return {
        status: 'ok',
        database: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'degraded',
        database: 'down',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
