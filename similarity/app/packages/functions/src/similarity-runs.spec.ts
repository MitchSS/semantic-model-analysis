import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN_PARAMETERS } from '@rayfin-app/shared';

import { SimilarityRunClient, refreshResultsMetadata, safely, toSimilarityRun, type FetchLike } from './similarity-runs.js';

const RUN_ID = '0b5f8a10-1111-4222-8333-944455556666';
const OTHER_RUN_ID = '1c6f8a10-1111-4222-8333-944455556666';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function client(...responses: Response[]) {
  const fetchMock = vi.fn<FetchLike>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  return { fetchMock, runs: new SimilarityRunClient('token', fetchMock, 'ws', 'nb') };
}

describe('toSimilarityRun', () => {
  it('maps known fields and truncates failure messages', () => {
    const run = toSimilarityRun({
      id: RUN_ID,
      status: 'Failed',
      invokeType: 'Manual',
      startTimeUtc: '2026-10-08T10:00:00Z',
      endTimeUtc: '2026-10-08T10:05:00Z',
      failureReason: { message: 'x'.repeat(1000) },
    });
    expect(run).toMatchObject({ id: RUN_ID, status: 'Failed', invokeType: 'Manual' });
    expect(run.failureMessage).toHaveLength(600);
  });

  it('reports unexpected statuses as Unknown', () => {
    expect(toSimilarityRun({ id: RUN_ID, status: 'Weird' }).status).toBe('Unknown');
  });
});

describe('SimilarityRunClient.start', () => {
  it('rejects invalid parameters without calling Fabric', async () => {
    const { fetchMock, runs } = client();
    const result = await runs.start({ ...DEFAULT_RUN_PARAMETERS, similarThreshold: 0.99 });
    expect(result.error?.code).toBe('invalid_parameters');
    expect(result.error?.fields.map((f) => f.field)).toEqual(['similarThreshold']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to start while another run is active', async () => {
    const { fetchMock, runs } = client(json({ value: [{ id: RUN_ID, status: 'InProgress' }] }));
    const result = await runs.start(DEFAULT_RUN_PARAMETERS);
    expect(result.error?.code).toBe('run_in_progress');
    expect(result.run?.id).toBe(RUN_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits notebook parameters and returns the job id from Location', async () => {
    const { fetchMock, runs } = client(
      json({ value: [{ id: OTHER_RUN_ID, status: 'Completed' }] }),
      new Response(null, {
        status: 202,
        headers: { Location: `https://api.fabric.microsoft.com/v1/workspaces/ws/items/nb/jobs/instances/${RUN_ID}` },
      })
    );
    const result = await runs.start({ ...DEFAULT_RUN_PARAMETERS, workspaceName: '  Sales  ', enableBlocking: false });

    expect(result).toEqual({
      run: expect.objectContaining({ id: RUN_ID, status: 'NotStarted' }),
      error: null,
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.fabric.microsoft.com/v1/workspaces/ws/items/nb/jobs/instances?jobType=RunNotebook');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body as string)).toEqual({
      executionData: {
        parameters: {
          WORKSPACE_NAME: { value: 'Sales', type: 'string' },
          MODEL_NAME: { value: '', type: 'string' },
          REPORT_WORKSPACE_NAME: { value: '', type: 'string' },
          ENABLE_BLOCKING: { value: false, type: 'bool' },
          DUPLICATE_THRESHOLD: { value: 0.95, type: 'float' },
          SIMILAR_THRESHOLD: { value: 0.7, type: 'float' },
          CONTAINMENT_THRESHOLD: { value: 0.95, type: 'float' },
          _inlineInstallationEnabled: { value: true, type: 'bool' },
        },
      },
    });
  });

  it('maps permission failures without leaking the provider body', async () => {
    const { runs } = client(json({ value: [] }), json({ errorCode: 'InsufficientPrivileges', message: 'secret detail' }, 403));
    const result = await runs.start(DEFAULT_RUN_PARAMETERS);
    expect(result.error?.code).toBe('permission_denied');
    expect(result.error?.message).not.toContain('secret detail');
  });

  it('fails safely when Fabric omits the Location header', async () => {
    const { runs } = client(json({ value: [] }), new Response(null, { status: 202 }));
    expect((await runs.start(DEFAULT_RUN_PARAMETERS)).error?.code).toBe('fabric_error');
  });
});

describe('SimilarityRunClient get/list/cancel', () => {
  it('rejects run ids that are not GUIDs', async () => {
    const { fetchMock, runs } = client();
    expect((await runs.get('../../items')).error?.code).toBe('invalid_run_id');
    expect((await runs.cancel(42)).error?.code).toBe('invalid_run_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the newest runs first with pending runs on top', async () => {
    const { runs } = client(
      json({
        value: [
          { id: OTHER_RUN_ID, status: 'Completed', startTimeUtc: '2026-10-01T00:00:00Z' },
          { id: RUN_ID, status: 'NotStarted', startTimeUtc: null },
        ],
      })
    );
    const result = await runs.list();
    expect(result.runs.map((run) => run.id)).toEqual([RUN_ID, OTHER_RUN_ID]);
  });

  it('cancels and then returns the refreshed run', async () => {
    const { fetchMock, runs } = client(new Response(null, { status: 202 }), json({ id: RUN_ID, status: 'Cancelled' }));
    const result = await runs.cancel(RUN_ID);
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/jobs/instances/${RUN_ID}/cancel$`));
    expect(result.run?.status).toBe('Cancelled');
  });

  it('maps throttling', async () => {
    const { runs } = client(json({}, 429));
    expect((await runs.get(RUN_ID)).error?.code).toBe('rate_limited');
  });
});

describe('safely', () => {
  it('turns thrown errors into a generic failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await safely(async () => {
      throw new Error('token=abc');
    }, { run: null });
    expect(result).toEqual({ run: null, error: expect.objectContaining({ code: 'fabric_error' }) });
    expect(result.error?.message).not.toContain('token');
  });
});

describe('refreshResultsMetadata', () => {
  it('posts to the SQL endpoint refreshMetadata API', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(new Response(null, { status: 202 }));
    await expect(refreshResultsMetadata('token', fetchMock, 'ws', 'sql')).resolves.toEqual({ refreshed: true, error: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.fabric.microsoft.com/v1/workspaces/ws/sqlEndpoints/sql/refreshMetadata');
    expect(init.method).toBe('POST');
  });

  it('reports permission failures without provider details', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(json({ message: 'secret' }, 403));
    const result = await refreshResultsMetadata('token', fetchMock, 'ws', 'sql');
    expect(result.refreshed).toBe(false);
    expect(result.error).toMatchObject({ code: 'permission_denied' });
    expect(result.error?.message).not.toContain('secret');
  });
});
