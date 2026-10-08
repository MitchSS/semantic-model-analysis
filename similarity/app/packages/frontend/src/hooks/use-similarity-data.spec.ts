import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/results/load', () => ({ loadResults: vi.fn() }));

import { describeLoadError, errorReference } from './use-similarity-data';

class NetworkError extends Error {
  override name = 'NetworkError';
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
  }
}

describe('load error messages', () => {
  it('maps permission failures to an access message', () => {
    expect(describeLoadError(new NetworkError('403 Forbidden', 403))).toMatch(/do not have access/);
  });

  it('includes a short reference without the raw message for other failures', () => {
    const message = describeLoadError(new NetworkError('server exploded: secret detail', 500, 'GRAPHQL_ERROR'));
    expect(message).toContain('NetworkError · GRAPHQL_ERROR · HTTP 500');
    expect(message).not.toContain('secret detail');
  });

  it('handles non-errors', () => {
    expect(errorReference('nope')).toBe('Unknown error');
  });

  it('explains an empty catalog', () => {
    expect(describeLoadError(new Error('No rows in semantic_models in the attached lakehouse.'))).toMatch(/No analysis results yet/);
  });
});
