/**
 * Notebook 001 run parameters exposed by the app. Names mirror the notebook's
 * Fabric parameters cell; blank filters mean "unfiltered" (the notebook maps
 * blank strings to None).
 */
export interface SimilarityRunParameters {
  workspaceName: string;
  modelName: string;
  reportWorkspaceName: string;
  enableBlocking: boolean;
  duplicateThreshold: number;
  similarThreshold: number;
  containmentThreshold: number;
}

export const DEFAULT_RUN_PARAMETERS: SimilarityRunParameters = {
  workspaceName: '',
  modelName: '',
  reportWorkspaceName: '',
  enableBlocking: true,
  duplicateThreshold: 0.95,
  similarThreshold: 0.7,
  containmentThreshold: 0.95,
};

export const MAX_NAME_LENGTH = 256;

export type RunParameterField = keyof SimilarityRunParameters;

export interface RunParameterError {
  field: RunParameterField;
  message: string;
}

export type NotebookParameterType = 'string' | 'bool' | 'float';

export interface NotebookParameter {
  value: string | boolean | number;
  type: NotebookParameterType;
}

const NAME_FIELDS = ['workspaceName', 'modelName', 'reportWorkspaceName'] as const;
const THRESHOLD_FIELDS = ['duplicateThreshold', 'similarThreshold', 'containmentThreshold'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate untrusted input (form state or a function request body) and return
 * normalized parameters. Never trusts client-side validation.
 */
export function validateRunParameters(
  input: unknown
): { parameters: SimilarityRunParameters; errors: [] } | { parameters: null; errors: RunParameterError[] } {
  const errors: RunParameterError[] = [];
  if (!isRecord(input)) {
    return { parameters: null, errors: [{ field: 'workspaceName', message: 'Run parameters are required.' }] };
  }

  const names = {} as Record<(typeof NAME_FIELDS)[number], string>;
  for (const field of NAME_FIELDS) {
    const value = input[field] ?? '';
    if (typeof value !== 'string') {
      errors.push({ field, message: 'Enter a name or leave it blank.' });
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_NAME_LENGTH) {
      errors.push({ field, message: `Use at most ${MAX_NAME_LENGTH} characters.` });
    }
    names[field] = trimmed;
  }

  const enableBlocking = input.enableBlocking;
  if (typeof enableBlocking !== 'boolean') {
    errors.push({ field: 'enableBlocking', message: 'Choose whether candidate blocking is on.' });
  }

  const thresholds = {} as Record<(typeof THRESHOLD_FIELDS)[number], number>;
  for (const field of THRESHOLD_FIELDS) {
    const value = input[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
      errors.push({ field, message: 'Enter a value greater than 0 and at most 1.' });
      continue;
    }
    thresholds[field] = value;
  }
  if (
    thresholds.similarThreshold !== undefined &&
    thresholds.duplicateThreshold !== undefined &&
    thresholds.similarThreshold > thresholds.duplicateThreshold
  ) {
    errors.push({ field: 'similarThreshold', message: 'Must not exceed the duplicate threshold.' });
  }

  if (errors.length) {
    return { parameters: null, errors };
  }
  return {
    parameters: { ...names, enableBlocking: enableBlocking as boolean, ...thresholds },
    errors: [],
  };
}

/** Map validated parameters to the notebook's parameter-cell variables. */
export function toNotebookParameters(parameters: SimilarityRunParameters): Record<string, NotebookParameter> {
  return {
    WORKSPACE_NAME: { value: parameters.workspaceName, type: 'string' },
    MODEL_NAME: { value: parameters.modelName, type: 'string' },
    REPORT_WORKSPACE_NAME: { value: parameters.reportWorkspaceName, type: 'string' },
    ENABLE_BLOCKING: { value: parameters.enableBlocking, type: 'bool' },
    DUPLICATE_THRESHOLD: { value: parameters.duplicateThreshold, type: 'float' },
    SIMILAR_THRESHOLD: { value: parameters.similarThreshold, type: 'float' },
    CONTAINMENT_THRESHOLD: { value: parameters.containmentThreshold, type: 'float' },
  };
}

/** Fabric job instance statuses; anything else is reported as Unknown. */
export type SimilarityRunStatus =
  | 'NotStarted'
  | 'InProgress'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Deduped'
  | 'Unknown';

export const ACTIVE_RUN_STATUSES: readonly SimilarityRunStatus[] = ['NotStarted', 'InProgress'];

export interface SimilarityRun {
  id: string;
  status: SimilarityRunStatus;
  invokeType: string | null;
  startTimeUtc: string | null;
  endTimeUtc: string | null;
  failureMessage: string | null;
}

export type SimilarityRunErrorCode =
  | 'invalid_parameters'
  | 'invalid_run_id'
  | 'run_in_progress'
  | 'permission_denied'
  | 'not_found'
  | 'rate_limited'
  | 'fabric_error';

export interface SimilarityRunError {
  code: SimilarityRunErrorCode;
  message: string;
  fields: RunParameterError[];
}

/** Result envelope returned by every run function. */
export interface SimilarityRunResult {
  run: SimilarityRun | null;
  error: SimilarityRunError | null;
}

export interface SimilarityRunListResult {
  runs: SimilarityRun[];
  error: SimilarityRunError | null;
}

/** Result of asking the lakehouse SQL endpoint to sync table metadata after a run. */
export interface SimilarityRefreshResult {
  refreshed: boolean;
  error: SimilarityRunError | null;
}

export const isActiveRun = (run: Pick<SimilarityRun, 'status'> | null | undefined): boolean =>
  !!run && ACTIVE_RUN_STATUSES.includes(run.status);
