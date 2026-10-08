import type { RebindActionRecord, RebindErrorCode, RebindResult } from '@rayfin-app/shared';

import { parseApprovers } from './caller.js';
import type { FetchLike } from './similarity-runs.js';

const POWER_BI_API = 'https://api.powerbi.com/v1.0/myorg';
const REQUEST_TIMEOUT_MS = 30_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RebindPlan = Pick<
  RebindActionRecord,
  'id' | 'kind' | 'reportId' | 'reportWorkspaceId' | 'fromModelId' | 'toModelId' | 'authorEmail'
>;

const failed = (code: RebindErrorCode, message: string, previousModelId: string | null = null): RebindResult => ({
  status: 'failed',
  previousModelId,
  error: { code, message },
});

function errorForStatus(status: number, previousModelId: string | null = null): RebindResult {
  if (status === 401 || status === 403) {
    return failed('permission_denied', 'The app identity is not allowed to read or rebind this report, or to build on the target model.', previousModelId);
  }
  if (status === 404) return failed('not_found', 'The report or target model was not found.', previousModelId);
  if (status === 429) return failed('rate_limited', 'Power BI is throttling requests. Try again shortly.', previousModelId);
  return failed('fabric_error', `Power BI returned HTTP ${status}.`, previousModelId);
}

/**
 * Checks that a plan may be executed: it is a `planned` row written by an approver
 * (the data service's create policy guarantees `authorEmail` is the real author).
 */
export function validatePlan(plan: RebindPlan | null | undefined, approverList: string | undefined | null): RebindResult | null {
  if (!plan || plan.kind !== 'planned') return failed('invalid_plan', 'Rebind plan not found.');
  if (!parseApprovers(approverList).has(String(plan.authorEmail).trim().toLowerCase())) {
    return failed('not_approved', 'Only a plan written by an approver can be executed.');
  }
  if (![plan.reportId, plan.reportWorkspaceId, plan.fromModelId, plan.toModelId].every((id) => GUID.test(String(id)))) {
    return failed('invalid_plan', 'The plan contains an invalid report, workspace or model ID.');
  }
  if (plan.fromModelId.toLowerCase() === plan.toModelId.toLowerCase()) {
    return failed('invalid_plan', 'The plan rebinds a report to the model it already uses.');
  }
  return null;
}

/**
 * Moves a report from `expectedModelId` to `targetModelId` with the Power BI Rebind API, as the
 * app identity. Refuses when the report's live binding is neither, so a stale plan never moves a
 * report that someone has already rebound elsewhere.
 */
export async function rebindReport(
  token: string,
  workspaceId: string,
  reportId: string,
  expectedModelId: string,
  targetModelId: string,
  fetchImpl: FetchLike = fetch
): Promise<RebindResult> {
  const reportUrl = `${POWER_BI_API}/groups/${workspaceId}/reports/${reportId}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await fetchImpl(reportUrl, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!current.ok) return errorForStatus(current.status);
  const report = (await current.json()) as { reportType?: unknown; datasetId?: unknown };
  const bound = typeof report.datasetId === 'string' ? report.datasetId.toLowerCase() : null;
  if (report.reportType !== 'PowerBIReport') {
    return failed('unsupported_report', 'Only Power BI reports can be rebound; paginated reports are not supported.', bound);
  }
  if (bound === targetModelId.toLowerCase()) return { status: 'already_bound', previousModelId: bound, error: null };
  if (bound !== expectedModelId.toLowerCase()) {
    return failed('wrong_binding', 'The report is no longer bound to the model in the plan. Refresh the analysis and plan again.', bound);
  }
  const response = await fetchImpl(`${reportUrl}/Rebind`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ datasetId: targetModelId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return errorForStatus(response.status, bound);
  return { status: 'rebound', previousModelId: bound, error: null };
}

/** Convert unexpected failures into a safe result without leaking provider details. */
export async function safeRebind(operation: () => Promise<RebindResult>): Promise<RebindResult> {
  try {
    return await operation();
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('Rebind failed', timedOut ? 'timeout' : error instanceof Error ? error.name : 'unknown');
    return failed('fabric_error', timedOut ? 'Power BI did not respond in time.' : 'The rebind request failed unexpectedly.');
  }
}
