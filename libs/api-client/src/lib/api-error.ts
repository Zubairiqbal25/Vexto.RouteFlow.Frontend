import { HttpErrorResponse } from '@angular/common/http';

/**
 * Every failure the UI ever sees, in one shape.
 *
 * The backend answers with RFC 7807 `ProblemDetails`; raw `HttpErrorResponse` objects never reach a
 * component. Translating once, here, is what makes "Access denied" and "That plate number is
 * already in use" possible instead of "Http failure response for ...: 409 Conflict".
 */
export type ApiErrorKind =
  | 'validation' // 400 — per-field errors, belongs on the form
  | 'unauthorized' // 401 — session gone
  | 'forbidden' // 403 — signed in, not allowed
  | 'notFound' // 404
  | 'conflict' // 409 — a business rule refused
  | 'unavailable' // 503 / network — try again shortly
  | 'unknown';

export class VextoApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    override readonly message: string,
    readonly status: number,
    /** Field name (camelCase, as the form control is named) to messages. Empty unless validation. */
    readonly fieldErrors: Readonly<Record<string, string[]>> = {},
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'VextoApiError';
  }

  /** The first message for a control, for inline display under a field. */
  fieldError(control: string): string | null {
    const key = Object.keys(this.fieldErrors).find(
      (candidate) => candidate.toLowerCase() === control.toLowerCase(),
    );

    return key ? (this.fieldErrors[key]?.[0] ?? null) : null;
  }
}

const FALLBACKS: Readonly<Record<ApiErrorKind, string>> = {
  validation: 'Please check the highlighted fields and try again.',
  unauthorized: 'Your session has ended. Please sign in again.',
  forbidden: "You do not have permission to do that.",
  notFound: 'We could not find what you were looking for.',
  conflict: 'That change conflicts with the current state of the record.',
  unavailable: 'Vexto is temporarily unavailable. Please try again in a moment.',
  unknown: 'Something went wrong. Please try again.',
};

function kindFor(status: number): ApiErrorKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 0:
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      return 'unknown';
  }
}

/**
 * Turns anything HttpClient can throw into a `VextoApiError`.
 *
 * `ProblemDetails.detail` is preferred over `title`: the backend puts the human-readable reason a
 * business rule refused into `detail`, and that is the sentence worth showing.
 */
export function toApiError(error: unknown): VextoApiError {
  if (error instanceof VextoApiError) {
    return error;
  }

  if (!(error instanceof HttpErrorResponse)) {
    return new VextoApiError('unknown', FALLBACKS.unknown, 0);
  }

  const kind = kindFor(error.status);
  const problem = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as {
    title?: string;
    detail?: string;
    errors?: Record<string, string[]>;
    traceId?: string;
  };

  const fieldErrors = problem.errors ?? {};

  // A validation response carries its real content per field; the envelope title ("One or more
  // validation errors occurred.") is noise, so the generic sentence reads better above the form.
  const message =
    kind === 'validation'
      ? (problem.detail ?? FALLBACKS.validation)
      : (problem.detail ?? problem.title ?? FALLBACKS[kind]);

  return new VextoApiError(kind, message, error.status, fieldErrors, problem.traceId);
}
