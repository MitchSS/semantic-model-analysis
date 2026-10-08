import { useCallback, useEffect, useRef, useState } from 'react';

import { loadResults, type LoadedResults } from '@/lib/results/load';

export type DataState =
  | { status: 'loading'; data: LoadedResults | null; error: null }
  | { status: 'ready'; data: LoadedResults; error: null }
  | { status: 'error'; data: LoadedResults | null; error: string };

/** Short, non-sensitive reference (error type, SDK code, HTTP status) for support. */
export function errorReference(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  const { code, status } = error as Error & { code?: unknown; status?: unknown };
  return [error.name, typeof code === 'string' ? code : null, typeof status === 'number' ? `HTTP ${status}` : null]
    .filter(Boolean)
    .join(' · ');
}

export function describeLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/40[13]|forbidden|unauthori[sz]ed|permission/i.test(message)) {
    return 'You do not have access to the similarity lakehouse. Ask the workspace owner for read access.';
  }
  if (/no rows in semantic_models/i.test(message)) {
    return 'No analysis results yet. Open Run analysis to start the first run.';
  }
  if (/invalid object name|not found/i.test(message)) {
    return 'The similarity tables were not found. Run the analysis once to create them.';
  }
  return `The similarity results could not be loaded. Try again shortly. (${errorReference(error)})`;
}

/** Loads the lakehouse result tables; keeps the previous dataset visible while refreshing. */
export function useSimilarityData(load: () => Promise<LoadedResults> = loadResults) {
  const [state, setState] = useState<DataState>({ status: 'loading', data: null, error: null });
  const request = useRef(0);

  const reload = useCallback(async () => {
    const id = ++request.current;
    setState((previous) => ({ status: 'loading', data: previous.data, error: null }));
    try {
      const data = await load();
      if (id === request.current) setState({ status: 'ready', data, error: null });
    } catch (error) {
      if (id === request.current) {
        // SDK errors carry no credentials; the full error helps diagnose host-specific failures in DevTools.
        console.error('Failed to load similarity results', error);
        setState((previous) => ({ status: 'error', data: previous.data, error: describeLoadError(error) }));
      }
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
