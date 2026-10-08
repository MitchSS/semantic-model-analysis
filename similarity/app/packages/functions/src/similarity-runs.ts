import {
  isActiveRun,
  toNotebookParameters,
  validateRunParameters,
  type SimilarityRefreshResult,
  type SimilarityRun,
  type SimilarityRunError,
  type SimilarityRunErrorCode,
  type SimilarityRunListResult,
  type SimilarityRunResult,
  type SimilarityRunStatus,
} from '@rayfin-app/shared';

/** Workspace that holds notebook 001 and its lakehouse (the app may be hosted in another workspace). */
export const SIMILARITY_WORKSPACE_ID = 'a5a00e8c-d269-4422-9cfc-a6626a4f2ff3';
/** Notebook `001_semantic_model_similarity`. */
export const SIMILARITY_NOTEBOOK_ID = '5bd4d491-889e-4b07-af84-daddfbc3c95c';
/** SQL analytics endpoint of lakehouse `LH_SemanticModels`, which the app's connector reads. */
export const SIMILARITY_SQL_ENDPOINT_ID = '845fae5b-bb66-41c3-9918-1e2ff3df0de3';

const FABRIC_API = 'https://api.fabric.microsoft.com/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_FAILURE_MESSAGE = 600;
const MAX_LISTED_RUNS = 10;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_STATUSES: readonly SimilarityRunStatus[] = [
  'NotStarted', 'InProgress', 'Completed', 'Failed', 'Cancelled', 'Deduped',
];

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface FabricJobInstance {
  id?: unknown;
  status?: unknown;
  invokeType?: unknown;
  startTimeUtc?: unknown;
  endTimeUtc?: unknown;
  failureReason?: { message?: unknown } | null;
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function toSimilarityRun(job: FabricJobInstance): SimilarityRun {
  const status = KNOWN_STATUSES.find((known) => known === job.status) ?? 'Unknown';
  const failure = asText(job.failureReason?.message);
  return {
    id: asText(job.id) ?? '',
    status,
    invokeType: asText(job.invokeType),
    startTimeUtc: asText(job.startTimeUtc),
    endTimeUtc: asText(job.endTimeUtc),
    failureMessage: failure ? failure.slice(0, MAX_FAILURE_MESSAGE) : null,
  };
}

const failure = (code: SimilarityRunErrorCode, message: string, fields: SimilarityRunError['fields'] = []) => ({
  code,
  message,
  fields,
});

function errorForStatus(status: number): SimilarityRunError {
  if (status === 401 || status === 403) {
    return failure('permission_denied', 'The app identity is not allowed to run or read notebook 001.');
  }
  if (status === 404) {
    return failure('not_found', 'The notebook or run was not found.');
  }
  if (status === 429) {
    return failure('rate_limited', 'Fabric is throttling job requests. Try again shortly.');
  }
  return failure('fabric_error', `Fabric returned HTTP ${status}.`);
}

/** Calls the Fabric Job Scheduler API for notebook 001 with an app-identity token. */
export class SimilarityRunClient {
  private readonly itemUrl: string;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
    workspaceId = SIMILARITY_WORKSPACE_ID,
    notebookId = SIMILARITY_NOTEBOOK_ID
  ) {
    this.itemUrl = `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${this.itemUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async list(): Promise<SimilarityRunListResult> {
    const response = await this.request('/jobs/instances');
    if (!response.ok) {
      return { runs: [], error: errorForStatus(response.status) };
    }
    const body = (await response.json()) as { value?: FabricJobInstance[] };
    const runs = (body.value ?? [])
      .map(toSimilarityRun)
      .filter((run) => run.id)
      .sort((a, b) => (b.startTimeUtc ?? '9999').localeCompare(a.startTimeUtc ?? '9999'))
      .slice(0, MAX_LISTED_RUNS);
    return { runs, error: null };
  }

  async get(runId: unknown): Promise<SimilarityRunResult> {
    if (typeof runId !== 'string' || !GUID.test(runId)) {
      return { run: null, error: failure('invalid_run_id', 'Run ID must be a GUID.') };
    }
    const response = await this.request(`/jobs/instances/${runId}`);
    if (!response.ok) {
      return { run: null, error: errorForStatus(response.status) };
    }
    return { run: toSimilarityRun((await response.json()) as FabricJobInstance), error: null };
  }

  async start(input: unknown): Promise<SimilarityRunResult> {
    const validation = validateRunParameters(input);
    if (!validation.parameters) {
      return {
        run: null,
        error: failure('invalid_parameters', 'Fix the highlighted run parameters.', validation.errors),
      };
    }

    // Notebook 001 overwrites its output tables, so only one run may be active at a time.
    const existing = await this.list();
    if (existing.error) {
      return { run: null, error: existing.error };
    }
    const active = existing.runs.find(isActiveRun);
    if (active) {
      return { run: active, error: failure('run_in_progress', 'A similarity run is already in progress.') };
    }

    const response = await this.request('/jobs/instances?jobType=RunNotebook', {
      method: 'POST',
      body: JSON.stringify({
        executionData: {
          parameters: {
            ...toNotebookParameters(validation.parameters),
            // Notebook 001 starts with `%pip install`, which Fabric disables in job runs unless this flag is set.
            _inlineInstallationEnabled: { value: true, type: 'bool' },
          },
        },
      }),
    });
    if (response.status !== 202 && !response.ok) {
      return { run: null, error: errorForStatus(response.status) };
    }
    const runId = response.headers.get('Location')?.split('?')[0].split('/').pop() ?? '';
    if (!GUID.test(runId)) {
      return { run: null, error: failure('fabric_error', 'Fabric accepted the run without returning its ID.') };
    }
    return {
      run: { id: runId, status: 'NotStarted', invokeType: 'Manual', startTimeUtc: null, endTimeUtc: null, failureMessage: null },
      error: null,
    };
  }

  async cancel(runId: unknown): Promise<SimilarityRunResult> {
    if (typeof runId !== 'string' || !GUID.test(runId)) {
      return { run: null, error: failure('invalid_run_id', 'Run ID must be a GUID.') };
    }
    const response = await this.request(`/jobs/instances/${runId}/cancel`, { method: 'POST' });
    if (response.status !== 202 && !response.ok) {
      return { run: null, error: errorForStatus(response.status) };
    }
    return this.get(runId);
  }
}

/**
 * Asks the lakehouse SQL analytics endpoint to sync Delta metadata now, so a finished run's
 * tables are readable immediately instead of after the background sync (often minutes).
 */
export async function refreshResultsMetadata(
  token: string,
  fetchImpl: FetchLike = fetch,
  workspaceId = SIMILARITY_WORKSPACE_ID,
  sqlEndpointId = SIMILARITY_SQL_ENDPOINT_ID
): Promise<SimilarityRefreshResult> {
  const response = await fetchImpl(`${FABRIC_API}/workspaces/${workspaceId}/sqlEndpoints/${sqlEndpointId}/refreshMetadata`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // 202 means the sync continues as a long-running operation; the caller reloads afterwards either way.
  if (response.status === 202 || response.ok) return { refreshed: true, error: null };
  if (response.status === 401 || response.status === 403) {
    return { refreshed: false, error: failure('permission_denied', 'The app identity is not allowed to refresh the results SQL endpoint.') };
  }
  return { refreshed: false, error: errorForStatus(response.status) };
}

/** Convert unexpected failures into a safe result without leaking provider details. */
export async function safely<T extends { error: SimilarityRunError | null }>(
  operation: () => Promise<T>,
  fallback: Omit<T, 'error'>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('Similarity run operation failed', timedOut ? 'timeout' : error instanceof Error ? error.name : 'unknown');
    return {
      ...fallback,
      error: failure('fabric_error', timedOut ? 'Fabric did not respond in time.' : 'The Fabric request failed unexpectedly.'),
    } as T;
  }
}
