/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  startSimilarityRun: {
    input: { parameters: { workspaceName: string; modelName: string; reportWorkspaceName: string; enableBlocking: boolean; duplicateThreshold: number; similarThreshold: number; containmentThreshold: number } };
    output: { run: null | { id: string; status: 'NotStarted' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled' | 'Deduped' | 'Unknown'; invokeType: null | string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string }; error: null | { code: 'invalid_parameters' | 'invalid_run_id' | 'run_in_progress' | 'permission_denied' | 'not_found' | 'rate_limited' | 'fabric_error'; message: string; fields: { field: 'workspaceName' | 'modelName' | 'reportWorkspaceName' | 'enableBlocking' | 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'; message: string }[] } };
  };
  getSimilarityRun: {
    input: { runId: string };
    output: { run: null | { id: string; status: 'NotStarted' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled' | 'Deduped' | 'Unknown'; invokeType: null | string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string }; error: null | { code: 'invalid_parameters' | 'invalid_run_id' | 'run_in_progress' | 'permission_denied' | 'not_found' | 'rate_limited' | 'fabric_error'; message: string; fields: { field: 'workspaceName' | 'modelName' | 'reportWorkspaceName' | 'enableBlocking' | 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'; message: string }[] } };
  };
  listSimilarityRuns: {
    input: Record<string, never>;
    output: { runs: { id: string; status: 'NotStarted' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled' | 'Deduped' | 'Unknown'; invokeType: null | string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string }[]; error: null | { code: 'invalid_parameters' | 'invalid_run_id' | 'run_in_progress' | 'permission_denied' | 'not_found' | 'rate_limited' | 'fabric_error'; message: string; fields: { field: 'workspaceName' | 'modelName' | 'reportWorkspaceName' | 'enableBlocking' | 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'; message: string }[] } };
  };
  cancelSimilarityRun: {
    input: { runId: string };
    output: { run: null | { id: string; status: 'NotStarted' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled' | 'Deduped' | 'Unknown'; invokeType: null | string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string }; error: null | { code: 'invalid_parameters' | 'invalid_run_id' | 'run_in_progress' | 'permission_denied' | 'not_found' | 'rate_limited' | 'fabric_error'; message: string; fields: { field: 'workspaceName' | 'modelName' | 'reportWorkspaceName' | 'enableBlocking' | 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'; message: string }[] } };
  };
  refreshSimilarityResults: {
    input: Record<string, never>;
    output: { refreshed: boolean; error: null | { code: 'invalid_parameters' | 'invalid_run_id' | 'run_in_progress' | 'permission_denied' | 'not_found' | 'rate_limited' | 'fabric_error'; message: string; fields: { field: 'workspaceName' | 'modelName' | 'reportWorkspaceName' | 'enableBlocking' | 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'; message: string }[] } };
  };
};
