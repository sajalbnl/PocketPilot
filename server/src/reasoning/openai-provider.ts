import { AGENT_DECISION_JSON_SCHEMA } from './prompt-v1.js';
import {
  ReasoningProviderError,
  type ReasoningProvider,
  type ReasoningProviderRequest,
  type ReasoningProviderResponse,
} from './provider.js';

interface OpenAIResponseBody {
  id?: string;
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
}

export class OpenAIReasoningProvider implements ReasoningProvider {
  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      baseUrl: string;
      timeoutMs: number;
      maxRetries: number;
    },
  ) {}

  async generate(request: ReasoningProviderRequest): Promise<ReasoningProviderResponse> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.call(request);
      } catch (error: unknown) {
        if (
          !(error instanceof ReasoningProviderError) ||
          !error.retryable ||
          attempt === this.config.maxRetries
        ) {
          throw error;
        }
      }
    }
    throw new ReasoningProviderError('PROVIDER_ERROR', 'Provider retry loop exhausted', false);
  }

  private async call(request: ReasoningProviderRequest): Promise<ReasoningProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const input = request.repair
        ? {
            context: request.context,
            repair: {
              instruction:
                'Return one corrected JSON object only. Do not add evidence or change grounded IDs.',
              validationError: request.repair.validationError,
              previousOutput: request.repair.previousOutput.slice(0, 8_000),
            },
          }
        : request.context;
      const response = await fetch(`${this.config.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          instructions: request.instructions,
          input: JSON.stringify(input),
          temperature: 0,
          max_output_tokens: 1_500,
          store: false,
          text: {
            format: {
              type: 'json_schema',
              name: 'pocketpilot_agent_decision',
              strict: true,
              schema: AGENT_DECISION_JSON_SCHEMA,
            },
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody;
      if (!response.ok) {
        const message =
          body.error?.message ?? `OpenAI request failed with status ${response.status}`;
        if (response.status === 429) {
          throw new ReasoningProviderError('RATE_LIMITED', message, true);
        }
        throw new ReasoningProviderError('PROVIDER_ERROR', message, response.status >= 500);
      }
      for (const item of body.output ?? []) {
        for (const content of item.content ?? []) {
          if (content.type === 'refusal') {
            throw new ReasoningProviderError(
              'REFUSAL',
              'The model refused the analysis request',
              false,
            );
          }
          if (content.type === 'output_text' && content.text) {
            return {
              rawText: content.text,
              provider: 'openai',
              model: this.config.model,
              responseId: body.id ?? null,
            };
          }
        }
      }
      throw new ReasoningProviderError(
        'PROVIDER_ERROR',
        'OpenAI response contained no output text',
        false,
      );
    } catch (error: unknown) {
      if (error instanceof ReasoningProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ReasoningProviderError('TIMEOUT', 'OpenAI reasoning request timed out', true);
      }
      throw new ReasoningProviderError(
        'PROVIDER_ERROR',
        error instanceof Error ? error.message : 'OpenAI request failed',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
