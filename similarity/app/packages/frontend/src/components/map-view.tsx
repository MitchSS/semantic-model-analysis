import { useState } from 'react';

import { StatusStrip, type ViewProps } from '@/components/review-view';
import { Field, Pager } from '@/components/ui';
import type { MapCell } from '@/lib/results/logic';
import { inputClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

const CELL_STYLE: Record<MapCell['style'], string> = {
  duplicate: 'bg-primary text-primary-foreground font-semibold',
  high: 'bg-primary/35 text-foreground',
  low: 'bg-muted text-muted-foreground',
  unscored: 'border border-dashed border-border text-muted-foreground',
  unavailable: 'border border-dashed border-destructive/50 text-destructive',
  outside: 'bg-secondary text-muted-foreground cursor-not-allowed',
  diagonal: 'text-muted-foreground',
};

function LegendKey({ style }: { style: MapCell['style'] }) {
  return <span aria-hidden="true" className={cn('inline-block h-[12px] w-[12px] rounded-sm', CELL_STYLE[style])} />;
}

export function MapView({ results, state, update, onHelp, onCompare }: ViewProps) {
  const selection = results.mapSelection(state);
  const [detail, setDetail] = useState<string | null>(null);
  const { visible } = selection;

  return (
    <section aria-labelledby="map-heading" className="flex flex-col gap-400">
      <h2 id="map-heading" className="font-heading text-500 font-semibold tracking-tight">
        Overall similarity map
      </h2>
      <StatusStrip results={results} state={state} onHelp={onHelp} />
      <div className="flex flex-wrap items-end gap-300">
        <Field label="Search">
          <input
            type="text"
            value={state.mapSearch}
            onChange={(event) => update({ mapSearch: event.target.value, mapPage: 1 })}
            aria-label="Search map models"
            placeholder="Models or workspaces"
            className={cn(inputClass, 'min-w-[220px]')}
          />
        </Field>
        <Field label="Workspace">
          <select value={state.mapWorkspace} onChange={(event) => update({ mapWorkspace: event.target.value, mapPage: 1 })} aria-label="Map workspace" className={inputClass}>
            <option value="all">All workspaces</option>
            {results.workspaceOptions().map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!visible.length ? (
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">
          {results.modelList.length ? 'No models match these filters.' : 'No cataloged models.'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-300 text-300 text-muted-foreground">
            <span role="status">
              Showing {selection.start + 1}-{selection.start + visible.length} of {selection.models.length} filtered models / {results.modelList.length} catalog models
            </span>
            <Pager
              page={selection.page}
              pages={selection.pages}
              onPage={(page) => update({ mapPage: page })}
              previousLabel="Previous model slice"
              nextLabel="Next model slice"
            />
          </div>
          <div className="flex flex-wrap items-center gap-400 text-200 text-muted-foreground" aria-label="Similarity map legend">
            <span className="flex items-center gap-100"><LegendKey style="duplicate" /> Possible duplicates</span>
            <span className="flex items-center gap-100"><LegendKey style="high" /> Shared structure</span>
            <span className="flex items-center gap-100"><LegendKey style="low" /> Below cutoff (including 0%)</span>
            <span className="flex items-center gap-100"><LegendKey style="unscored" /> Not scored (·)</span>
            <span className="flex items-center gap-100"><LegendKey style="unavailable" /> Unavailable (?)</span>
            <span>— Same model</span>
            {state.crossOnly ? <span>× Outside scope</span> : null}
          </div>
          <div className="overflow-auto rounded-md border border-border bg-card" tabIndex={0} role="region" aria-label="Overall similarity matrix">
            <table className="border-collapse text-200" aria-label="Semantic model overall similarity map">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-card px-300 py-200 text-left font-medium">
                    Model
                  </th>
                  {visible.map((entry) => {
                    const label = `${entry.name} / ${entry.workspace}`;
                    return (
                      <th key={entry.id} scope="col" title={label} className="h-[128px] w-[46px] max-w-[46px] px-100 align-bottom font-normal">
                        <span className="block max-h-[120px] overflow-hidden text-ellipsis whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{label}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" title={`${row.name} / ${row.workspace}`} className="sticky left-0 z-10 max-w-[240px] bg-card px-300 py-100 text-left font-medium">
                      <div className="truncate">{row.name}</div>
                      <div className="truncate text-200 font-normal text-muted-foreground">{row.workspace}</div>
                    </th>
                    {visible.map((column) => {
                      const cell = results.mapCell(state, row.id, column.id);
                      const base = cn('flex h-[36px] w-[44px] items-center justify-center rounded-sm font-numeric tabular-nums', CELL_STYLE[cell.style]);
                      if (cell.kind === 'diagonal') {
                        return (
                          <td key={column.id} className="p-[1px]">
                            <span className={base} title={cell.detail} aria-label={cell.detail}>
                              —
                            </span>
                          </td>
                        );
                      }
                      const show = () => setDetail(cell.detail);
                      return (
                        <td key={column.id} className="p-[1px]">
                          <button
                            type="button"
                            className={cn(base, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', cell.kind !== 'outside' && 'hover:ring-1 hover:ring-primary')}
                            title={cell.detail}
                            aria-label={cell.kind === 'outside' ? cell.detail : `Compare ${cell.detail}`}
                            aria-disabled={cell.kind === 'outside' ? true : undefined}
                            onFocus={show}
                            onPointerEnter={show}
                            onClick={() => {
                              if (cell.kind !== 'outside' && results.inComparisonScope(state, row.id, column.id)) {
                                onCompare(row.id, column.id, results.relevantSection(results.pair(row.id, column.id)));
                              }
                            }}
                          >
                            <span aria-hidden={cell.kind === 'unscored' ? true : undefined}>{cell.text}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div aria-live="polite" className="min-h-[20px] text-300 text-muted-foreground">
            {detail ?? `${visible.length} selected models`}
          </div>
        </>
      )}
    </section>
  );
}
