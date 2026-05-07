export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'plan_limit_exceeded'
  | 'provider_error'
  | 'internal_error';

export class KanalError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'KanalError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class UnauthorizedError extends KanalError {
  constructor(message = 'Unauthorized') {
    super('unauthorized', message, 401);
  }
}

export class ForbiddenError extends KanalError {
  constructor(message = 'Forbidden') {
    super('forbidden', message, 403);
  }
}

export class NotFoundError extends KanalError {
  constructor(resource: string) {
    super('not_found', `${resource} not found`, 404);
  }
}

export class ValidationError extends KanalError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('validation_error', message, 400, details);
  }
}

export class PlanLimitExceededError extends KanalError {
  constructor(metric: string, limit: number) {
    super('plan_limit_exceeded', `Plan limit exceeded for ${metric}`, 402, { metric, limit });
  }
}

export class ProviderError extends KanalError {
  constructor(provider: string, message: string, details?: Record<string, unknown>) {
    super('provider_error', `[${provider}] ${message}`, 502, details);
  }
}
