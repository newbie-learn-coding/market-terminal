export type ProviderName = 'brightdata' | 'openrouter' | 'coingecko' | 'database' | 'youtube';

export type ProviderErrorCode =
  | 'invalid_config'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'unavailable'
  | 'bad_response'
  | 'aborted'
  | 'unknown';

export class ProviderError extends Error {
  provider: ProviderName;
  code: ProviderErrorCode;
  retryable: boolean;
  status?: number;

  constructor({
    provider,
    code,
    message,
    retryable,
    status,
  }: {
    provider: ProviderName;
    code: ProviderErrorCode;
    message: string;
    retryable: boolean;
    status?: number;
  }) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function codeFromStatus(status: number): {
  code: ProviderErrorCode;
  retryable: boolean;
} {
  if (status === 400 || status === 404) return { code: 'bad_response', retryable: false };
  if (status === 401 || status === 403) return { code: 'auth', retryable: false };
  if (status === 408) return { code: 'timeout', retryable: true };
  if (status === 429) return { code: 'rate_limit', retryable: true };
  if (status >= 500) return { code: 'unavailable', retryable: true };
  return { code: 'unknown', retryable: false };
}

export function providerErrorFromStatus(
  provider: ProviderName,
  status: number,
  message: string,
): ProviderError {
  const { code, retryable } = codeFromStatus(status);
  return new ProviderError({ provider, code, retryable, status, message });
}

export function normalizeProviderError(
  provider: ProviderName,
  error: unknown,
  fallbackMessage: string,
): ProviderError {
  if (error instanceof ProviderError) return error;

  const message = error instanceof Error ? error.message : String(error || fallbackMessage);
  if (/aborted/i.test(message)) {
    return new ProviderError({
      provider,
      code: 'aborted',
      retryable: false,
      message,
    });
  }
  if (/timeout|timed out|etimedout/i.test(message)) {
    return new ProviderError({
      provider,
      code: 'timeout',
      retryable: true,
      message,
    });
  }
  if (/missing|not configured/i.test(message)) {
    return new ProviderError({
      provider,
      code: 'invalid_config',
      retryable: false,
      message,
    });
  }

  return new ProviderError({
    provider,
    code: 'unknown',
    retryable: false,
    message,
  });
}
