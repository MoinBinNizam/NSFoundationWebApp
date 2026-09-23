import { afterEach, describe, expect, it } from 'vitest';
import { normalizePhone } from '../middlewares/sanitize.js';
import { errorHandler } from '../middlewares/error.js';

const originalEnvironment = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = originalEnvironment; });

describe('security baseline', () => {
  it('normalizes Bangladesh domestic, international Bangladesh, and foreign phone numbers', () => {
    expect(normalizePhone('01747969041')).toBe('+8801747969041');
    expect(normalizePhone('+8801521-213224')).toBe('+8801521213224');
    expect(normalizePhone('+1 (202) 555-0100')).toBe('+12025550100');
  });

  it('rejects malformed phone values', () => {
    expect(() => normalizePhone('abc')).toThrow('Enter a Bangladesh mobile number');
  });

  it('does not expose unexpected production errors', () => {
    process.env.NODE_ENV = 'production';
    let status = 0; let payload: Record<string, unknown> = {};
    const response = { status(code: number) { status = code; return this; }, json(value: Record<string, unknown>) { payload = value; return this; } };
    errorHandler(new Error('mongodb://secret-host/private'), {} as any, response as any, (() => undefined) as any);
    expect(status).toBe(500);
    expect(payload.message).toBe('An unexpected error occurred. Please contact an administrator with the request ID.');
  });
});
