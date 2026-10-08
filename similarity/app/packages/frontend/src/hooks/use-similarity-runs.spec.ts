import type { SimilarityRun } from '@rayfin-app/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rayfin-client', () => ({ getRayfinClient: vi.fn() }));

import { MAX_POLL_FAILURES, POLL_INTERVAL_MS, useSimilarityRuns, type RunApi } from './use-similarity-runs';

const run = (status: SimilarityRun['status'], id = 'run-1'): SimilarityRun => ({
  id,
  status,
  invokeType: 'Manual',
  startTimeUtc: null,
  endTimeUtc: null,
  failureMessage: null,
});

function api(overrides: Partial<RunApi> = {}): RunApi {
  return {
    list: vi.fn(async () => ({ runs: [], error: null })),
    get: vi.fn(async () => ({ run: run('Completed'), error: null })),
    start: vi.fn(async () => ({ run: run('NotStarted'), error: null })),
    cancel: vi.fn(async () => ({ run: run('Cancelled'), error: null })),
    ...overrides,
  };
}

describe('useSimilarityRuns', () => {
  beforeEach(() => {
    // Fake only timeouts: faking setImmediate/MessageChannel stalls React's scheduler.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls an active run until it completes and then notifies once', async () => {
    const onCompleted = vi.fn();
    const get = vi.fn().mockResolvedValueOnce({ run: run('InProgress'), error: null }).mockResolvedValueOnce({ run: run('Completed'), error: null });
    const runsApi = api({ list: vi.fn(async () => ({ runs: [run('InProgress')], error: null })), get });
    const { result } = renderHook(() => useSimilarityRuns(onCompleted, runsApi));
    await act(async () => {});
    expect(result.current.active?.id).toBe('run-1');

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(get).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBeNull();
    expect(result.current.runs[0].status).toBe('Completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not report completion for failed runs', async () => {
    const onCompleted = vi.fn();
    const runsApi = api({ get: vi.fn(async () => ({ run: { ...run('Failed'), failureMessage: 'boom' }, error: null })) });
    const { result } = renderHook(() => useSimilarityRuns(onCompleted, runsApi));
    await act(async () => {});
    await act(async () => {
      await result.current.start({
        workspaceName: '', modelName: '', reportWorkspaceName: '', enableBlocking: true,
        duplicateThreshold: 0.95, similarThreshold: 0.7, containmentThreshold: 0.95,
      });
    });
    expect(result.current.active?.status).toBe('NotStarted');
    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.runs[0]).toMatchObject({ status: 'Failed', failureMessage: 'boom' });
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('stops polling and surfaces an error after repeated failures', async () => {
    const get = vi.fn(async () => {
      throw new Error('network');
    });
    const runsApi = api({ list: vi.fn(async () => ({ runs: [run('InProgress')], error: null })), get });
    const onCompleted = vi.fn();
    const { result } = renderHook(() => useSimilarityRuns(onCompleted, runsApi));
    await act(async () => {});
    for (let attempt = 1; attempt <= MAX_POLL_FAILURES; attempt += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * attempt));
    }
    expect(get).toHaveBeenCalledTimes(MAX_POLL_FAILURES);
    expect(result.current.error?.message).toMatch(/unavailable/);
    await act(async () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 10));
    expect(get).toHaveBeenCalledTimes(MAX_POLL_FAILURES);
  });

  it('returns server field errors without raising a banner', async () => {
    const fields = [{ field: 'similarThreshold' as const, message: 'Must not exceed the duplicate threshold.' }];
    const runsApi = api({ start: vi.fn(async () => ({ run: null, error: { code: 'invalid_parameters' as const, message: 'Fix', fields } })) });
    const onCompleted = vi.fn();
    const { result } = renderHook(() => useSimilarityRuns(onCompleted, runsApi));
    await act(async () => {});
    let returned: unknown;
    await act(async () => {
      returned = await result.current.start({
        workspaceName: '', modelName: '', reportWorkspaceName: '', enableBlocking: true,
        duplicateThreshold: 0.95, similarThreshold: 0.99, containmentThreshold: 0.95,
      });
    });
    expect(returned).toMatchObject({ code: 'invalid_parameters', fields });
    expect(result.current.error).toBeNull();
  });
});
