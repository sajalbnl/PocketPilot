import { z } from 'zod';

import type { SignalNotificationData } from '@pocketpilot/shared';

const ExpoTicketSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), id: z.string().min(1) }).passthrough(),
  z
    .object({
      status: z.literal('error'),
      message: z.string().min(1),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
]);
const ExpoResponseSchema = z
  .object({ data: z.array(ExpoTicketSchema), errors: z.array(z.unknown()).optional() })
  .passthrough();

export interface PushMessage {
  to: string[];
  title: string;
  body: string;
  data: SignalNotificationData;
}

export interface PushSendResult {
  ticketIds: string[];
}

export interface PushGateway {
  send(message: PushMessage): Promise<PushSendResult>;
}

export class ExpoPushClient implements PushGateway {
  constructor(
    private readonly options: {
      url: string;
      accessToken?: string | undefined;
      timeoutMs: number;
    },
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    const response = await fetch(this.options.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.options.accessToken
          ? { Authorization: `Bearer ${this.options.accessToken}` }
          : {}),
      },
      body: JSON.stringify(
        message.to.map((to) => ({
          to,
          sound: 'default',
          priority: 'high',
          channelId: 'approvals',
          title: message.title,
          body: message.body,
          data: message.data,
        })),
      ),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Expo push API returned HTTP ${response.status}`);
    const parsed = ExpoResponseSchema.parse(payload);
    const failed = parsed.data.find((ticket) => ticket.status === 'error');
    if (failed?.status === 'error')
      throw new Error(`Expo push rejected payload: ${failed.message}`);
    return {
      ticketIds: parsed.data
        .filter(
          (ticket): ticket is z.infer<typeof ExpoTicketSchema> & { status: 'ok' } =>
            ticket.status === 'ok',
        )
        .map((ticket) => ticket.id),
    };
  }
}
