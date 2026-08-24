import type { ReasoningContext } from './prompt-v1.js';

export interface ReasoningProviderRequest {
  instructions: string;
  context: ReasoningContext;
  repair?: { previousOutput: string; validationError: string };
}

export interface ReasoningProviderResponse {
  rawText: string;
  provider: string;
  model: string;
  responseId: string | null;
}

export interface ReasoningProvider {
  generate(request: ReasoningProviderRequest): Promise<ReasoningProviderResponse>;
}

export class ReasoningProviderError extends Error {
  constructor(
    readonly code: 'TIMEOUT' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'REFUSAL',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ReasoningProviderError';
  }
}
