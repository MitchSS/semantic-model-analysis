import { useCallback, useEffect, useRef, useState } from 'react';

import { loadSimilarityDataset, type LoadedDataset } from '@/lib/similarity-data';

export type DataState =
  | { status: 'loading'; data: LoadedDataset | null; error: null }
  | { status: 'ready'; data: LoadedDataset; error: null }
  | { status: 'error'; data: LoadedDataset | null; error: string };

export function describeLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/40[13]|forbidden|unauthori[sz]ed|permission/i.test(message)) {
    return 'You do not have access to the similarity lakehouse. Ask the workspace owner for read access.';
  }
  if (/invalid object name|not found/i.test(message)) {
    return 'The similarity tables were not found. Run the analysis once to create them.';
  }
  return 'The similarity results could not be loaded. Try again shortly.';
}

/** Loads the lakehouse result tables; keeps the previous dataset visible while refreshing. */
export function useSimilarityData(load: () => Promise<LoadedDataset> = loadSimilarityDataset) {
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
        console.error('Failed to load similarity results', error instanceof Error ? error.name : 'unknown');
        setState((previous) => ({ status: 'error', data: previous.data, error: describeLoadError(error) }));
      }
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
