import { describe, expect, it, vi } from 'vitest';

import { parseApprovers } from './caller.js';
import { rebindReport, safeRebind, validatePlan, type RebindPlan } from './rebind.js';
import type { FetchLike } from './similarity-runs.js';

const WS = '11111111-1111-4111-8111-111111111111';
const REPORT = '22222222-2222-4222-8222-222222222222';
const FROM = '33333333-3333-4333-8333-333333333333';
const TO = '44444444-4444-4444-8444-444444444444';
const APPROVERS = 'Approver@Contoso.com; other@contoso.com';

const plan = (overrides: Partial<RebindPlan> = {}): RebindPlan => ({
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'planned',
  reportId: REPORT,
  reportWorkspaceId: WS,
  fromModelId: FROM,
  toModelId: TO,
  authorEmail: 'approver@contoso.com',
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseApprovers', () => {
  it('normalises case and separators and drops invalid entries', () => {
    expect([...parseApprovers(' A@x.com, b@y.org;nope  c@z.net ')]).toEqual(['a@x.com', 'b@y.org', 'c@z.net']);
    expect(parseApprovers(undefined).size).toBe(0);
  });
});

describe('validatePlan', () => {
  it('accepts a planned row written by an approver', () => {
    expect(validatePlan(plan(), APPROVERS)).toBeNull();
  });

  it('rejects missing, non-plan and non-approver rows', () => {
    expect(validatePlan(null, APPROVERS)?.error?.code).toBe('invalid_plan');
    expect(validatePlan(plan({ kind: 'executed' }), APPROVERS)?.error?.code).toBe('invalid_plan');
    expect(validatePlan(plan({ authorEmail: 'someone@contoso.com' }), APPROVERS)?.error?.code).toBe('not_approved');
    expect(validatePlan(plan(), '')?.error?.code).toBe('not_approved');
  });

  it('rejects malformed IDs and no-op plans', () => {
    expect(validatePlan(plan({ reportId: '../x' }), APPROVERS)?.error?.code).toBe('invalid_plan');
    expect(validatePlan(plan({ toModelId: FROM }), APPROVERS)?.error?.code).toBe('invalid_plan');
  });
});

describe('rebindReport', () => {
  it('rebinds when the live binding matches the plan', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(json({ reportType: 'PowerBIReport', datasetId: FROM })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(rebindReport('t', WS, REPORT, FROM, TO, fetchMock)).resolves.toEqual({ status: 'rebound', previousModelId: FROM, error: null });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`https://api.powerbi.com/v1.0/myorg/groups/${WS}/reports/${REPORT}/Rebind`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ datasetId: TO });
  });

  it('is idempotent when the report already uses the target', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(json({ reportType: 'PowerBIReport', datasetId: TO.toUpperCase() }));
    await expect(rebindReport('t', WS, REPORT, FROM, TO, fetchMock)).resolves.toMatchObject({ status: 'already_bound' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses paginated reports and unexpected bindings without rebinding', async () => {
    const paginated = vi.fn<FetchLike>().mockResolvedValueOnce(json({ reportType: 'PaginatedReport', datasetId: FROM }));
    await expect(rebindReport('t', WS, REPORT, FROM, TO, paginated)).resolves.toMatchObject({ error: { code: 'unsupported_report' } });
    const moved = vi.fn<FetchLike>().mockResolvedValueOnce(json({ reportType: 'PowerBIReport', datasetId: '66666666-6666-4666-8666-666666666666' }));
    await expect(rebindReport('t', WS, REPORT, FROM, TO, moved)).resolves.toMatchObject({ error: { code: 'wrong_binding' } });
    expect(paginated).toHaveBeenCalledTimes(1);
    expect(moved).toHaveBeenCalledTimes(1);
  });

  it('maps Power BI failures without provider details', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(json({ reportType: 'PowerBIReport', datasetId: FROM })).mockResolvedValueOnce(json({ error: 'secret' }, 403));
    const result = await rebindReport('t', WS, REPORT, FROM, TO, fetchMock);
    expect(result).toMatchObject({ status: 'failed', previousModelId: FROM, error: { code: 'permission_denied' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('safeRebind', () => {
  it('turns exceptions into a sanitized failure', async () => {
    const result = await safeRebind(async () => {
      throw new Error('boom token=abc');
    });
    expect(result).toMatchObject({ status: 'failed', error: { code: 'fabric_error' } });
    expect(JSON.stringify(result)).not.toContain('abc');
  });
});
