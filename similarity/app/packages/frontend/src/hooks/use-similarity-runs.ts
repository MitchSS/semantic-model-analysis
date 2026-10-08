import {
  isActiveRun,
  type SimilarityRun,
  type SimilarityRunError,
  type SimilarityRunParameters,
  type SimilarityRunResult,
} from '@rayfin-app/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getRayfinClient } from '@/lib/rayfin-client';

export const POLL_INTERVAL_MS = 15_000;
export const MAX_POLL_FAILURES = 4;

export interface RunApi {
  list(): Promise<{ runs: SimilarityRun[]; error: SimilarityRunError | null }>;
  get(runId: string): Promise<SimilarityRunResult>;
  start(parameters: SimilarityRunParameters): Promise<SimilarityRunResult>;
  cancel(runId: string): Promise<SimilarityRunResult>;
}

export const functionsRunApi: RunApi = {
  async list() {
    return (await getRayfinClient()).functions.listSimilarityRuns.invoke();
  },
  async get(runId) {
    return (await getRayfinClient()).functions.getSimilarityRun.invoke({ runId });
  },
  async start(parameters) {
    return (await getRayfinClient()).functions.startSimilarityRun.invoke({ parameters });
  },
  async cancel(runId) {
    return (await getRayfinClient()).functions.cancelSimilarityRun.invoke({ runId });
  },
};

const unexpected = (message: string): SimilarityRunError => ({ code: 'fabric_error', message, fields: [] });

/**
 * Tracks notebook 001 runs: lists recent runs, starts/cancels, and polls the
 * active run until it finishes, then calls `onCompleted`.
 */
export function useSimilarityRuns(onCompleted: () => void, api: RunApi = functionsRunApi) {
  const [runs, setRuns] = useState<SimilarityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SimilarityRunError | null>(null);
  const completed = useRef(onCompleted);
  useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);

  const active = runs.find(isActiveRun) ?? null;

  const upsert = useCallback((run: SimilarityRun) => {
    setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
  }, []);

  const applyList = useCallback((result: Awaited<ReturnType<RunApi['list']>>) => {
    if (result.error) {
      setError(result.error);
    } else {
      setRuns(result.runs);
      setError(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyList(await api.list());
    } catch {
      setError(unexpected('Run history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [api, applyList]);

  useEffect(() => {
    let cancelled = false;
    api
      .list()
      .then((result) => {
        if (!cancelled) applyList(result);
      })
      .catch(() => {
        if (!cancelled) setError(unexpected('Run history could not be loaded.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, applyList]);

  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const result = await api.get(activeId);
        if (cancelled) return;
        if (result.run) {
          failures = 0;
          upsert(result.run);
          if (!isActiveRun(result.run)) {
            if (result.run.status === 'Completed') completed.current();
            return;
          }
        } else if (++failures >= MAX_POLL_FAILURES) {
          setError(result.error ?? unexpected('Run status is unavailable.'));
          return;
        }
      } catch {
        if (cancelled) return;
        if (++failures >= MAX_POLL_FAILURES) {
          setError(unexpected('Run status is unavailable. Refresh to try again.'));
          return;
        }
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS * (failures + 1));
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeId, api, upsert]);

  const start = useCallback(
    async (parameters: SimilarityRunParameters): Promise<SimilarityRunError | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await api.start(parameters);
        if (result.run) upsert(result.run);
        if (result.error && result.error.code !== 'invalid_parameters') setError(result.error);
        return result.error;
      } catch {
        const failure = unexpected('The run could not be started. Try again shortly.');
        setError(failure);
        return failure;
      } finally {
        setBusy(false);
      }
    },
    [api, upsert]
  );

  const cancel = useCallback(async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const result = await api.cancel(activeId);
      if (result.run) upsert(result.run);
      setError(result.error);
    } catch {
      setError(unexpected('The run could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  }, [activeId, api, upsert]);

  return { runs, active, loading, busy, error, start, cancel, refresh };
}
