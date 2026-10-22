import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { IdentificationSchema, SYSTEM_PROMPT, type Identification } from './identification-schema.ts';
import type { IdentifyRequest } from './validation.ts';

export class ProviderError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface IdentifyOutput extends Identification {
  provider: string;
}

export class AnthropicIdentifier {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: 'low' | 'medium' | 'high';

  constructor(apiKey: string, model: string, effort: 'low' | 'medium' | 'high', timeoutMs: number) {
    this.model = model;
    this.effort = effort;
    // One retry on transient errors; the app shows a manual-entry path on failure.
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async identify(request: IdentifyRequest, signal?: AbortSignal): Promise<IdentifyOutput> {
    let response;
    try {
      response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          // Route policy declines to Anthropic's recommended fallback model instead of failing.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: this.effort, format: betaZodOutputFormat(IdentificationSchema) },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: request.mimeType, data: request.image } },
                { type: 'text', text: 'Identify this die-cast car.' },
              ],
            },
          ],
        },
        { signal },
      );
    } catch (error) {
      throw mapSdkError(error);
    }

    if (response.stop_reason === 'refusal') {
      throw new ProviderError(422, 'The AI service declined to analyse this photo.');
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new ProviderError(502, 'The AI service returned an incomplete answer.');
    }
    return { ...response.parsed_output, provider: `anthropic/${response.model}` };
  }
}

function mapSdkError(error: unknown): ProviderError {
  if (error instanceof Anthropic.RateLimitError) {
    const retry = Number(error.headers?.get?.('retry-after'));
    return new ProviderError(429, 'The AI provider is rate limiting requests.', Number.isFinite(retry) ? retry : 30);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(503, 'AI provider is misconfigured on the server.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ProviderError(400, 'The AI provider could not process this image.');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError(504, 'The AI provider timed out.');
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new ProviderError(504, 'The request was cancelled.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError(502, 'Could not reach the AI provider.');
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError(503, 'The AI provider is temporarily unavailable.');
  }
  return new ProviderError(500, 'Identification failed.');
}
