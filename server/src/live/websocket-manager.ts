export interface WebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketManagerHealth {
  status: 'idle' | 'connecting' | 'connected' | 'backoff' | 'exhausted' | 'stopped';
  reconnectAttempts: number;
  subscriptionsSent: number;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  nextReconnectAt: string | null;
}

export function boundedBackoffDelay(input: {
  attempt: number;
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
  random?: () => number;
}): number {
  const exponential = Math.min(input.maxMs, input.baseMs * 2 ** Math.max(0, input.attempt));
  const random = input.random?.() ?? Math.random();
  const jitter = exponential * input.jitterRatio * (random * 2 - 1);
  return Math.max(0, Math.round(Math.min(input.maxMs, exponential + jitter)));
}

export class ResubscribingWebSocketManager {
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private healthValue: WebSocketManagerHealth = {
    status: 'idle',
    reconnectAttempts: 0,
    subscriptionsSent: 0,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastError: null,
    nextReconnectAt: null,
  };

  constructor(
    private readonly options: {
      url: string;
      subscriptions: readonly Record<string, unknown>[];
      reconnectBaseMs: number;
      reconnectMaxMs: number;
      reconnectLimit: number;
      jitterRatio: number;
      heartbeatMs: number;
      socketFactory?: ((url: string) => WebSocketLike) | undefined;
      random?: (() => number) | undefined;
      now?: (() => Date) | undefined;
      onMessage: (data: unknown, receivedAt: Date) => void;
    },
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.healthValue.status = 'connecting';
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.socket?.close(1000, 'pocketpilot shutdown');
    this.socket = null;
    this.healthValue.status = 'stopped';
    this.healthValue.nextReconnectAt = null;
  }

  health(): WebSocketManagerHealth {
    return { ...this.healthValue };
  }

  private connect(): void {
    if (this.stopped) return;
    this.healthValue.status = this.healthValue.reconnectAttempts === 0 ? 'connecting' : 'backoff';
    try {
      const factory =
        this.options.socketFactory ??
        ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
      const socket = factory(this.options.url);
      this.socket = socket;
      socket.onopen = () => this.onOpen(socket);
      socket.onmessage = (event) => this.onMessage(event.data);
      socket.onerror = () => {
        this.healthValue.lastError = 'WebSocket transport error';
      };
      socket.onclose = (event) => this.onClose(event);
    } catch (error: unknown) {
      this.healthValue.lastError = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect();
    }
  }

  private onOpen(socket: WebSocketLike): void {
    if (this.stopped || socket !== this.socket) return;
    this.healthValue.status = 'connected';
    this.healthValue.lastConnectedAt = this.now().toISOString();
    this.healthValue.nextReconnectAt = null;
    this.healthValue.lastError = null;
    for (const subscription of this.options.subscriptions) {
      socket.send(JSON.stringify({ method: 'subscribe', subscription }));
      this.healthValue.subscriptionsSent += 1;
    }
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.socket === socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ method: 'ping' }));
      }
    }, this.options.heartbeatMs);
  }

  private onMessage(data: unknown): void {
    const receivedAt = this.now();
    this.healthValue.lastMessageAt = receivedAt.toISOString();
    this.healthValue.reconnectAttempts = 0;
    this.options.onMessage(data, receivedAt);
  }

  private onClose(event: { code?: number; reason?: string }): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.socket = null;
    if (this.stopped) return;
    this.healthValue.lastError = `WebSocket closed${event.code ? ` (${event.code})` : ''}${event.reason ? `: ${event.reason}` : ''}`;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    if (this.healthValue.reconnectAttempts >= this.options.reconnectLimit) {
      this.healthValue.status = 'exhausted';
      this.healthValue.nextReconnectAt = null;
      return;
    }
    const delay = boundedBackoffDelay({
      attempt: this.healthValue.reconnectAttempts,
      baseMs: this.options.reconnectBaseMs,
      maxMs: this.options.reconnectMaxMs,
      jitterRatio: this.options.jitterRatio,
      ...(this.options.random ? { random: this.options.random } : {}),
    });
    this.healthValue.reconnectAttempts += 1;
    this.healthValue.status = 'backoff';
    this.healthValue.nextReconnectAt = new Date(this.now().getTime() + delay).toISOString();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}
