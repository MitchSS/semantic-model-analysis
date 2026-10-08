import { Moon, RefreshCw, Sun } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CompareView } from '@/components/compare-view';
import { GroupsView } from '@/components/groups-view';
import { MapView } from '@/components/map-view';
import { ReviewView } from '@/components/review-view';
import { RunPanel, RunStatusBadge } from '@/components/run-panel';
import { Notice, Skeleton } from '@/components/ui';
import { buttonClass } from '@/lib/styles';
import { ThemeContext } from '@/hooks/theme.context';
import { useSimilarityData } from '@/hooks/use-similarity-data';
import { useSimilarityRuns } from '@/hooks/use-similarity-runs';
import type { ClusterView, PairView } from '@/lib/similarity-model';
import { cn } from '@/lib/utils';

type View = 'review' | 'groups' | 'compare' | 'map' | 'run';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'groups', label: 'Groups' },
  { id: 'compare', label: 'Compare' },
  { id: 'map', label: 'Similarity map' },
  { id: 'run', label: 'Run analysis' },
];

/** Lakehouse SQL endpoint metadata can lag Delta writes; re-read once after a short delay. */
const SYNC_LAG_RELOAD_MS = 45_000;

function App() {
  const theme = useContext(ThemeContext);
  const data = useSimilarityData();
  const { reload } = data;
  const lagTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRunCompleted = useCallback(() => {
    void reload();
    clearTimeout(lagTimer.current);
    lagTimer.current = setTimeout(() => void reload(), SYNC_LAG_RELOAD_MS);
  }, [reload]);
  useEffect(() => () => clearTimeout(lagTimer.current), []);
  const runs = useSimilarityRuns(onRunCompleted);

  const [view, setView] = useState<View>('review');
  const [crossWorkspaceOnly, setCrossWorkspaceOnly] = useState(false);
  const [compare, setCompare] = useState<{ a: string | null; b: string | null; from: View | null }>({ a: null, b: null, from: null });

  const dataset = data.data;
  const scopedPairs = useMemo(
    () => (dataset ? dataset.pairs.filter((pair) => !crossWorkspaceOnly || pair.crossWorkspace) : []),
    [dataset, crossWorkspaceOnly]
  );
  const scopedClusters = useMemo<ClusterView[]>(
    () =>
      !dataset
        ? []
        : crossWorkspaceOnly
          ? dataset.clusters.filter((cluster) => cluster.workspaceCount > 1)
          : dataset.clusters,
    [dataset, crossWorkspaceOnly]
  );

  const openCompare = (aId: string, bId: string) => {
    setCompare({ a: aId, b: bId, from: view === 'compare' ? compare.from : view });
    setView('compare');
  };
  const openPair = (pair: PairView) => openCompare(pair.a.id, pair.b.id);

  const latestRun = runs.active ?? runs.runs[0] ?? null;

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-300 px-600 py-300">
          <div className="flex items-center gap-300">
            <span aria-hidden="true" className="grid h-[28px] w-[28px] grid-cols-2 gap-[2px]">
              <span className="rounded-[1px] bg-primary" />
              <span className="rounded-[1px] bg-primary/40" />
              <span className="rounded-[1px] bg-primary/40" />
              <span className="rounded-[1px] bg-primary" />
            </span>
            <div>
              <h1 className="font-heading text-500 font-semibold leading-500 tracking-tight">Semantic Model Similarity</h1>
              <p className="text-200 text-muted-foreground">
                {dataset?.run?.generatedAt ? `Results from ${new Date(dataset.run.generatedAt).toLocaleString()}` : 'Duplicate and overlap review for Fabric semantic models'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-300">
            {latestRun ? (
              <button type="button" onClick={() => setView('run')} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open run analysis">
                <RunStatusBadge run={latestRun} />
              </button>
            ) : null}
            <label className="flex items-center gap-200 text-300 text-muted-foreground">
              <input
                type="checkbox"
                checked={crossWorkspaceOnly}
                onChange={(event) => setCrossWorkspaceOnly(event.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Cross-workspace only
            </label>
            <button type="button" className={buttonClass('ghost')} onClick={() => void reload()} disabled={data.status === 'loading'} aria-label="Reload results">
              <RefreshCw aria-hidden="true" className={cn('icon-size-200', data.status === 'loading' && 'animate-spin')} />
            </button>
            <button type="button" className={buttonClass('ghost')} onClick={theme.toggleTheme} aria-label={theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme.isDark ? <Sun aria-hidden="true" className="icon-size-200" /> : <Moon aria-hidden="true" className="icon-size-200" />}
            </button>
          </div>
        </div>
        <nav aria-label="Views" className="mx-auto flex max-w-[1440px] gap-100 overflow-x-auto px-600">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 px-300 py-200 text-300 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-400 px-600 py-600">
        {data.status === 'error' ? (
          <Notice
            tone="error"
            title="Couldn't load similarity results"
            action={
              <button type="button" className={buttonClass()} onClick={() => void reload()}>
                Try again
              </button>
            }
          >
            {data.error}
          </Notice>
        ) : null}
        {dataset?.truncated ? (
          <Notice tone="warning" title="Large catalog">
            Only the first 50,000 rows of a table were loaded. Narrow the run scope for complete results.
          </Notice>
        ) : null}
        {dataset && dataset.errors.length ? (
          <Notice tone="warning" title={`${dataset.errors.length} model${dataset.errors.length === 1 ? '' : 's'} could not be read during the last scan`}>
            <details>
              <summary className="cursor-pointer">Show catalog errors</summary>
              <ul className="mt-200 flex flex-col gap-100">
                {dataset.errors.slice(0, 50).map((error, index) => (
                  <li key={index}>
                    <span className="font-medium text-foreground">{error.model || 'Workspace'}</span> · {error.workspace} — {error.errorType}
                  </li>
                ))}
              </ul>
            </details>
          </Notice>
        ) : null}

        {view === 'run' ? (
          <RunPanel
            runs={runs.runs}
            active={runs.active}
            loading={runs.loading}
            busy={runs.busy}
            error={runs.error}
            lastAnalysis={dataset?.run ?? null}
            onStart={runs.start}
            onCancel={() => void runs.cancel()}
            onRefresh={() => void runs.refresh()}
          />
        ) : !dataset ? (
          data.status === 'loading' ? (
            <div aria-busy="true" aria-label="Loading results">
              <Skeleton rows={8} />
            </div>
          ) : null
        ) : view === 'review' ? (
          <ReviewView dataset={dataset} pairs={scopedPairs} onCompare={openPair} />
        ) : view === 'groups' ? (
          <GroupsView key={crossWorkspaceOnly ? 'cross' : 'all'} clusters={scopedClusters} onCompare={openPair} />
        ) : view === 'compare' ? (
          <CompareView
            dataset={dataset}
            modelA={compare.a}
            modelB={compare.b}
            onChange={(a, b) => setCompare({ ...compare, a, b })}
            onBack={compare.from ? () => setView(compare.from ?? 'review') : null}
          />
        ) : (
          <MapView dataset={dataset} pairs={scopedPairs} onCompare={(_, a, b) => openCompare(a, b)} />
        )}
      </main>
    </div>
  );
}

export default App;
