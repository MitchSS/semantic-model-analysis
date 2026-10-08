import { HelpCircle, Moon, RefreshCw, SlidersHorizontal, Sun } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CompareView, type CompareSelection } from '@/components/compare-view';
import { GroupsView, type GroupSelections } from '@/components/groups-view';
import { MapView } from '@/components/map-view';
import { ActionsView, GroupActions } from '@/components/next-actions';
import { HelpDialog, SettingsPanel } from '@/components/results-chrome';
import { ReviewView } from '@/components/review-view';
import { RunPanel, RunStatusBadge } from '@/components/run-panel';
import { Notice, Skeleton } from '@/components/ui';
import { ThemeContext } from '@/hooks/theme.context';
import { useActions } from '@/hooks/use-actions';
import { useSimilarityData } from '@/hooks/use-similarity-data';
import { useSimilarityRuns } from '@/hooks/use-similarity-runs';
import { Results, defaultThresholds, initialViewState, validScore, type Thresholds, type ViewState } from '@/lib/results/logic';
import type { ResultsPayload } from '@/lib/results/payload';
import { buttonClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

type Tab = 'review' | 'groups' | 'map' | 'compare' | 'run' | 'actions';

/** Same order and labels as notebook 002, plus the app-only Run analysis tab. */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'groups', label: 'Groups' },
  { id: 'map', label: 'Similarity map' },
  { id: 'compare', label: 'Compare' },
  { id: 'run', label: 'Run analysis' },
  { id: 'actions', label: 'Actions' },
];

/** Lakehouse SQL endpoint metadata can lag Delta writes; re-read once after a short delay. */
const SYNC_LAG_RELOAD_MS = 45_000;
/** Shared with notebook 002 so saved thresholds mean the same thing in both views. */
const THRESHOLDS_KEY = 'sms-thresholds-v2';

function savedThresholds(defaults: Thresholds): Thresholds {
  try {
    const saved = JSON.parse(localStorage.getItem(THRESHOLDS_KEY) ?? 'null') as Partial<Thresholds> | null;
    if (!saved) return defaults;
    const pick = (key: keyof Thresholds) => {
      const value = saved[key];
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : defaults[key];
    };
    return { duplicate: pick('duplicate'), similar: pick('similar'), containment: pick('containment') };
  } catch {
    return defaults;
  }
}

function defaultSelection(data: ResultsPayload): CompareSelection {
  const list = data.modelList ?? [];
  return { a: data.defaultCompare?.a || list[0]?.id || '', b: data.defaultCompare?.b || list[1]?.id || '', openSections: {} };
}

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
  const actions = useActions();

  const loaded = data.data;
  const payload = loaded?.payload ?? null;
  const results = useMemo(() => (payload ? new Results(payload) : null), [payload]);

  const [tab, setTab] = useState<Tab>('review');
  const [view, setView] = useState<ViewState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compare, setCompare] = useState<CompareSelection | null>(null);
  const [returnTab, setReturnTab] = useState<Tab | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupSelections, setGroupSelections] = useState<GroupSelections>({});

  // On every new payload (first load or a finished run) take the run's thresholds unless the user
  // saved their own, like 002; other filters survive reloads.
  const [initialisedFor, setInitialisedFor] = useState<ResultsPayload | null>(null);
  if (payload && payload !== initialisedFor) {
    setInitialisedFor(payload);
    const thresholds = savedThresholds(defaultThresholds(payload));
    setView((current) => (current ? { ...current, thresholds } : { ...initialViewState(payload), thresholds }));
    setCompare((current) => (current && payload.models[current.a] && payload.models[current.b] ? current : defaultSelection(payload)));
  }

  const update = useCallback((patch: Partial<ViewState>) => setView((current) => (current ? { ...current, ...patch } : current)), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  // Like 002's openCompare/backToResults: focus Model A on open; on Back restore scroll and the trigger's focus.
  const returnPoint = useRef<{ scrollY: number; label: string | null } | null>(null);
  const pendingFocus = useRef<'compare' | 'back' | null>(null);
  useEffect(() => {
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (pending === 'compare') {
      document.getElementById('compare-model-a')?.focus({ preventScroll: true });
    } else if (pending === 'back' && returnPoint.current) {
      const { scrollY, label } = returnPoint.current;
      const trigger = label ? [...document.querySelectorAll<HTMLButtonElement>('main button[aria-label]')].find((button) => button.getAttribute('aria-label') === label) : undefined;
      trigger?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY });
    }
  }, [tab]);

  const openCompare = useCallback(
    (a: string, b: string, section?: string) => {
      if (tab !== 'compare') {
        setReturnTab(tab);
        const active = document.activeElement;
        returnPoint.current = { scrollY: window.scrollY, label: active instanceof HTMLElement ? active.getAttribute('aria-label') : null };
      }
      setCompare({ a, b, openSections: section ? { [section]: true } : {} });
      update({ cmpDiffOnly: true });
      setTab('compare');
      pendingFocus.current = 'compare';
      window.scrollTo({ top: 0 });
    },
    [tab, update]
  );
  const goBack = () => {
    if (!returnTab) return;
    setTab(returnTab);
    pendingFocus.current = 'back';
  };
  const applyThresholds = (next: Thresholds) => {
    if (!(['duplicate', 'similar', 'containment'] as const).every((key) => validScore(next[key]))) return;
    update({ thresholds: next, page: 1 });
    try {
      localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in embedded hosts; thresholds still apply for this session.
    }
  };

  const latestRun = runs.active ?? runs.runs[0] ?? null;
  const generatedAt = loaded?.run?.generatedAt ?? payload?.generatedAt;

  const content = () => {
    if (tab === 'actions') return <ActionsView actions={actions} />;
    if (tab === 'run') {
      return (
        <RunPanel
          runs={runs.runs}
          active={runs.active}
          loading={runs.loading}
          busy={runs.busy}
          error={runs.error}
          lastAnalysis={loaded?.run ?? null}
          onStart={runs.start}
          onCancel={() => void runs.cancel()}
          onRefresh={() => void runs.refresh()}
        />
      );
    }
    if (!results || !view || !compare) {
      return data.status === 'loading' ? (
        <div aria-busy="true" aria-label="Loading results">
          <Skeleton rows={8} />
        </div>
      ) : null;
    }
    const props = { results, state: view, update, onHelp: openHelp, onCompare: openCompare };
    if (tab === 'review') {
      return <ReviewView {...props} expanded={expanded} onToggleExpanded={(key) => setExpanded((current) => ({ ...current, [key]: !current[key] }))} />;
    }
    if (tab === 'groups') {
      return (
        <GroupsView
          {...props}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          selections={groupSelections}
          onSelectionChange={(key, chosen) => setGroupSelections((current) => ({ ...current, [key]: chosen }))}
          actions={(group) => <GroupActions key={results.groupKey(group)} results={results} state={view} group={group} actions={actions} />}
        />
      );
    }
    if (tab === 'map') return <MapView {...props} />;
    return (
      <CompareView
        results={results}
        state={view}
        update={update}
        onHelp={openHelp}
        selection={compare}
        onSelectionChange={setCompare}
        backLabel={returnTab ? (TABS.find((item) => item.id === returnTab)?.label ?? null) : null}
        onBack={goBack}
      />
    );
  };

  const iconButton = cn(buttonClass('ghost'), 'h-[36px] w-[36px] px-0');

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
                {generatedAt ? `Results from ${new Date(generatedAt).toLocaleString()}` : 'Duplicate and overlap review for Fabric semantic models'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-200">
            {latestRun ? (
              <button type="button" onClick={() => setTab('run')} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open run analysis">
                <RunStatusBadge run={latestRun} />
              </button>
            ) : null}
            <button type="button" className={iconButton} onClick={() => void reload()} disabled={data.status === 'loading'} aria-label="Reload results" title="Reload results">
              <RefreshCw aria-hidden="true" className={cn('icon-size-200', data.status === 'loading' && 'animate-spin')} />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Review thresholds"
              title="Review thresholds"
              aria-expanded={settingsOpen}
              aria-controls="scoring-settings"
              disabled={!view}
            >
              <SlidersHorizontal aria-hidden="true" className="icon-size-200" />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={theme.toggleTheme}
              aria-label={theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme.isDark ? <Sun aria-hidden="true" className="icon-size-200" /> : <Moon aria-hidden="true" className="icon-size-200" />}
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={openHelp}
              aria-label="Definitions and scan details"
              title="Definitions and scan details"
              aria-haspopup="dialog"
              disabled={!results}
            >
              <HelpCircle aria-hidden="true" className="icon-size-200" />
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-300 px-600">
          <nav aria-label="Views" className="flex gap-100 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 px-300 py-200 text-300 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tab === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <label className="flex items-center gap-200 py-200 text-300 text-muted-foreground">
            <input
              type="checkbox"
              checked={view?.crossOnly ?? false}
              disabled={!view}
              onChange={(event) => update({ crossOnly: event.target.checked, page: 1, mapPage: 1 })}
              className="accent-[var(--color-primary)]"
            />
            Cross-workspace only
          </label>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-400 px-600 py-600">
        {settingsOpen && view && payload ? (
          <SettingsPanel
            key={JSON.stringify(view.thresholds)}
            thresholds={view.thresholds} defaults={defaultThresholds(payload)} onApply={applyThresholds} onHelp={openHelp} />
        ) : null}
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
        {loaded?.truncated ? (
          <Notice tone="warning" title="Large catalog">
            Only the first 100,000 rows of a table were loaded. Narrow the run scope for complete results.
          </Notice>
        ) : null}
        {loaded && loaded.errors.length ? (
          <Notice tone="warning" title={`${loaded.errors.length} model${loaded.errors.length === 1 ? '' : 's'} could not be read during the last scan`}>
            <details>
              <summary className="cursor-pointer">Show catalog errors</summary>
              <ul className="mt-200 flex flex-col gap-100">
                {loaded.errors.slice(0, 50).map((error, index) => (
                  <li key={index}>
                    <span className="font-medium text-foreground">{error.model || 'Workspace'}</span> · {error.workspace} — {error.errorType}
                  </li>
                ))}
              </ul>
            </details>
          </Notice>
        ) : null}
        {content()}
      </main>
      {results ? <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} results={results} /> : null}
    </div>
  );
}

export default App;
