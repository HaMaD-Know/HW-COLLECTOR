/**
 * Result of an AI identification. Only fields the provider actually returns
 * are populated; there are deliberately no confidence scores, rarity or value
 * fields because the model cannot verify those.
 */
export interface IdentificationResult {
  suggestedName: string;
  manufacturer: string | null;
  series: string | null;
  releaseYear: number | null;
  color: string | null;
  alternatives: string[];
  reasoningSummary: string;
  needsManualReview: boolean;
  /** false when the photo does not appear to show a die-cast car. */
  isDiecastCar: boolean;
  /** Which model/provider produced this, for transparency in the UI. */
  provider: string;
}

export interface IdentificationImage {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type IdentificationErrorCode =
  | 'not-configured'
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'too-large'
  | 'unsupported-type'
  | 'bad-response'
  | 'refused'
  | 'unavailable'
  | 'unauthorized'
  | 'unknown';

const MESSAGES: Record<IdentificationErrorCode, string> = {
  'not-configured': 'AI identification is not set up. You can still enter the name yourself.',
  offline: 'You appear to be offline. Enter the name manually or try again later.',
  timeout: 'The AI service took too long to respond. Try again or enter the name manually.',
  'rate-limited': 'Too many identification requests. Wait a minute and try again.',
  'too-large': 'This photo is too large to send. Try a smaller photo.',
  'unsupported-type': 'This image format is not supported. Use JPEG, PNG or WebP.',
  'bad-response': 'The AI service returned an unexpected answer. Enter the name manually.',
  refused: 'The AI service declined to identify this photo. Enter the name manually.',
  unavailable: 'The AI service is temporarily unavailable. Enter the name manually.',
  unauthorized: 'The identification service rejected this app. Check the AI settings.',
  unknown: 'Identification failed. You can still enter the name manually.',
};

export class IdentificationError extends Error {
  constructor(
    public readonly code: IdentificationErrorCode,
    message: string = MESSAGES[code],
  ) {
    super(message);
    this.name = 'IdentificationError';
  }
}

export interface ProviderStatus {
  configured: boolean;
  /** Human readable, e.g. "Proxy at https://… (anthropic)". */
  description: string;
}

export interface CarIdentificationProvider {
  readonly id: string;
  isConfigured(): boolean;
  identify(image: IdentificationImage, signal?: AbortSignal): Promise<IdentificationResult>;
  status(signal?: AbortSignal): Promise<ProviderStatus>;
}
