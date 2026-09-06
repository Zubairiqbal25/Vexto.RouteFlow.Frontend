import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { VextoApiError, toApiError } from './api-error';

function problem(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, url: 'https://api/test' });
}

describe('toApiError', () => {
  it('turns a 409 ProblemDetails into the business reason, not the envelope title', () => {
    const error = toApiError(
      problem(409, { title: 'Conflict', detail: 'That plate number is already in use.' }),
    );

    expect(error.kind).toBe('conflict');
    expect(error.message).toBe('That plate number is already in use.');
  });

  it('exposes validation errors per field, case-insensitively', () => {
    const error = toApiError(
      problem(400, {
        title: 'One or more validation errors occurred.',
        errors: { MobileNumber: ['Mobile number is not a valid UAE number.'] },
      }),
    );

    expect(error.kind).toBe('validation');
    expect(error.fieldError('mobileNumber')).toBe('Mobile number is not a valid UAE number.');
  });

  it('does not surface the validation envelope title as the form message', () => {
    const error = toApiError(problem(400, { title: 'One or more validation errors occurred.' }));

    expect(error.message).toBe('Please check the highlighted fields and try again.');
  });

  it('treats a dead connection as temporarily unavailable rather than unknown', () => {
    expect(toApiError(problem(0, null)).kind).toBe('unavailable');
    expect(toApiError(problem(503, null)).kind).toBe('unavailable');
  });

  it('never leaks a raw HttpClient message', () => {
    const error = toApiError(problem(500, 'Internal Server Error'));

    expect(error.message).toBe('Something went wrong. Please try again.');
  });

  it('passes an already-translated error through untouched', () => {
    const original = new VextoApiError('forbidden', 'Nope.', 403);

    expect(toApiError(original)).toBe(original);
  });
});
