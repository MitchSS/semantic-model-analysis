import { ArrowUpDown, ChevronRight, GitCompareArrows, Merge } from 'lucide-react';
import { Fragment } from 'react';

import { Field, LinkButton, Metric, MetricGrid, Pager, ScoreCell, Tag } from '@/components/ui';
import { LABELS, pairKey, type Results, type SortKey, type ViewState } from '@/lib/results/logic';
import type { PayloadPair } from '@/lib/results/payload';
import { inputClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

export interface ViewProps {
  results: Results;
  state: ViewState;
  update: (patch: Partial<ViewState>) => void;
  onHelp: () => void;
  onCompare: (a: string, b: string, section?: string) => void;
}

export function StatusStrip({ results, state, onHelp }: Pick<ViewProps, 'results' | 'state' | 'onHelp'>) {
  const strip = results.statusStrip(state);
  return (
    <div className="flex flex-wrap items-center gap-200" aria-label="Scan status">
      <LinkButton warning={strip.securityWarning} onClick={onHelp}>
        Security: {strip.security}
      </LinkButton>
      <LinkButton warning={strip.reportsWarning} onClick={onHelp}>
        Reports: {strip.reports}
      </LinkButton>
      <LinkButton onClick={onHelp}>Scan details</LinkButton>
      {strip.unknownWorkspace ? (
        <Tag warning>
          Workspace unknown: {strip.unknownWorkspace} model{strip.unknownWorkspace === 1 ? '' : 's'}
        </Tag>
      ) : null}
    </div>
  );
}

export function SecurityTag({ results, pair }: { results: Results; pair: PayloadPair | undefined }) {
  const tag = results.securityTag(pair);
  return <Tag warning={tag.warning}>{tag.label}</Tag>;
}

export function SchemaSignals({ results, pair }: { results: Results; pair: PayloadPair }) {
  return (
    <MetricGrid>
      {results.schemaSignals(pair).map((signal) => (
        <Metric key={signal.label} label={signal.label} value={signal.value} unavailable={signal.unavailable} />
      ))}
    </MetricGrid>
  );
}

const SECURITY_OPTIONS: [string, string][] = [
  ['all', 'All states'],
  ['different', 'Differs'],
  ['match', 'Matches'],
  ['not_applicable', 'No model roles'],
  ['unknown', 'Not assessed'],
];
const POWER_QUERY_OPTIONS: [string, string][] = [
  ['all', 'All states'],
  ['differs', 'Differs'],
  ['matches', 'Matches'],
  ['not_applicable', 'No M on either'],
];

export function ReviewView({
  results,
  state,
  update,
  onHelp,
  onCompare,
  expanded,
  onToggleExpanded,
  onConsolidate,
}: ViewProps & { expanded: Record<string, boolean>; onToggleExpanded: (key: string) => void; onConsolidate?: (a: string, b: string) => void }) {
  const selection = results.reviewSelection(state);
  const groups = results.buildGroups(state);
  const total = selection.rows.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.max(1, Math.min(state.page, pages));
  const start = (page - 1) * state.pageSize;
  const rows = selection.rows.slice(start, start + state.pageSize);
  const findingOptions: [string, string, number][] = [
    ['all', 'All findings', selection.base.length],
    ['duplicate', LABELS.duplicate, selection.counts.duplicate],
    ['containment', LABELS.containment, selection.counts.containment],
    ['overlap', LABELS.overlap, selection.counts.overlap],
  ];

  const sortHeading = (key: SortKey, label: string) => {
    const active = state.sort === key;
    const ariaSort = active ? (key === 'rank' ? 'other' : state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th scope="col" aria-sort={ariaSort} className="px-300 py-200">
        <button
          type="button"
          onClick={() => update({ sortDirection: state.sort === key && state.sortDirection === 'desc' ? 'asc' : 'desc', sort: key, page: 1 })}
          className={cn('inline-flex items-center gap-100 font-medium hover:text-foreground', active ? 'text-foreground' : 'text-muted-foreground')}
        >
          {label}
          <span aria-hidden="true">{active && key !== 'rank' ? (state.sortDirection === 'asc' ? '↑' : '↓') : <ArrowUpDown className="icon-size-100 opacity-50" />}</span>
        </button>
      </th>
    );
  };

  const identity = (id: string, pair: PayloadPair, disclosure: boolean) => {
    const entry = results.model(id);
    const key = pairKey(pair.idA, pair.idB);
    const isOpen = Boolean(expanded[key]);
    const label = `Score indicators for ${results.pairModelLabel(pair.idA, pair.idB)} and ${results.pairModelLabel(pair.idB, pair.idA)}`;
    return (
      <td className="px-300 py-200 align-top">
        {disclosure ? (
          <button
            type="button"
            onClick={() => onToggleExpanded(key)}
            aria-expanded={isOpen}
            aria-controls={`pair-indicators-${encodeURIComponent(key)}`}
            aria-label={label}
            title={`${isOpen ? 'Hide' : 'Show'} score indicators`}
            className="flex items-center gap-100 text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{entry.name}</span>
            <ChevronRight aria-hidden="true" className={cn('icon-size-200 shrink-0 transition', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <div className="font-medium text-foreground">{entry.name}</div>
        )}
        <div className="text-200 text-muted-foreground">{entry.workspace || 'Unknown workspace'}</div>
      </td>
    );
  };

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-400">
      <h2 id="review-heading" className="sr-only">
        Review
      </h2>
      <div className="grid grid-cols-1 gap-300 sm:grid-cols-3" aria-label="Catalog model count and comparison-scope totals">
        {[
          [results.modelList.length, 'Catalog models'],
          [selection.all.length, state.crossOnly ? 'Cross-workspace pairs' : 'Candidate pairs'],
          [groups.length, 'Duplicate groups'],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col gap-100 rounded-md border border-border bg-card px-400 py-300">
            <strong className="font-numeric text-hero-700 font-semibold leading-hero-700 tabular-nums">{value}</strong>
            <span className="text-200 text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <StatusStrip results={results} state={state} onHelp={onHelp} />

      <div className="flex flex-wrap items-end gap-300">
        <Field label="Search">
          <input
            type="text"
            value={state.search}
            onChange={(event) => update({ search: event.target.value, page: 1 })}
            aria-label="Search review candidates"
            placeholder="Models or workspaces"
            className={cn(inputClass, 'min-w-[220px]')}
          />
        </Field>
        <Field label="Finding">
          <select value={state.filter} onChange={(event) => update({ filter: event.target.value as ViewState['filter'], page: 1 })} aria-label="Finding" className={inputClass}>
            {findingOptions.map(([value, label, count]) => (
              <option key={value} value={value}>
                {label} ({count})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Workspace">
          <select value={state.workspace} onChange={(event) => update({ workspace: event.target.value, page: 1 })} aria-label="Workspace" className={inputClass}>
            <option value="all">All workspaces</option>
            {results.workspaceOptions().map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Security">
          <select value={state.security} onChange={(event) => update({ security: event.target.value, page: 1 })} aria-label="Security state" className={inputClass}>
            {SECURITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Power Query">
          <select value={state.powerQuery} onChange={(event) => update({ powerQuery: event.target.value, page: 1 })} aria-label="Power Query state" className={inputClass}>
            {POWER_QUERY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-300">
        <h3 className="font-heading text-400 font-semibold">Candidate pairs</h3>
        <span className="flex items-center gap-300 text-300 text-muted-foreground">
          <span role="status">
            {total} of {selection.all.length} candidates
          </span>
          <LinkButton onClick={() => update({ filter: 'all', search: '', workspace: 'all', security: 'all', powerQuery: 'all', page: 1 })}>Clear filters</LinkButton>
        </span>
      </div>

      {rows.length ? (
        <div className="overflow-auto rounded-md border border-border bg-card" role="region" aria-label="Candidate pair scores" tabIndex={0}>
          <table className="w-full min-w-[960px] border-collapse text-left text-300">
            <thead className="border-b border-border bg-secondary text-200 text-muted-foreground">
              <tr>
                <th scope="col" className="px-300 py-200 font-medium">Model A</th>
                <th scope="col" className="px-300 py-200 font-medium">Model B</th>
                {sortHeading('combined', 'Overall')}
                {sortHeading('schema', 'Schema')}
                {sortHeading('security', 'Security')}
                {sortHeading('rank', 'Finding')}
                <th scope="col" className="px-300 py-200">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const { pair } = item;
                const key = pairKey(pair.idA, pair.idB);
                return (
                  <Fragment key={key}>
                    <tr className="border-b border-border hover:bg-[var(--color-hover)]" data-pair-key={key}>
                      {identity(pair.idA, pair, true)}
                      {identity(pair.idB, pair, false)}
                      <td className="px-300 py-200 align-top"><ScoreCell value={pair.combined} emphasis /></td>
                      <td className="px-300 py-200 align-top"><ScoreCell value={pair.schema} /></td>
                      <td className="px-300 py-200 align-top">
                        <ScoreCell value={pair.security} unavailable={pair.securityStatus === 'not_applicable' ? 'Not applicable' : 'Unavailable'} />
                      </td>
                      <td className="px-300 py-200 align-top">
                        <div className="mb-100 font-medium">{item.category.label}</div>
                        <SecurityTag results={results} pair={pair} />
                      </td>
                      <td className="px-300 py-200 text-right align-top">
                        <span className="inline-flex gap-100">
                          <button
                            type="button"
                            onClick={() => onCompare(pair.idA, pair.idB, results.relevantSection(pair))}
                            title="Compare models"
                            aria-label={`Compare ${results.pairModelLabel(pair.idA, pair.idB)} and ${results.pairModelLabel(pair.idB, pair.idA)}`}
                            className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-input bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <GitCompareArrows aria-hidden="true" className="icon-size-200" />
                          </button>
                          {onConsolidate ? (
                            <button
                              type="button"
                              onClick={() => onConsolidate(pair.idA, pair.idB)}
                              title="Consolidate"
                              aria-label={`Consolidate ${results.pairModelLabel(pair.idA, pair.idB)} and ${results.pairModelLabel(pair.idB, pair.idA)}`}
                              className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-input bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Merge aria-hidden="true" className="icon-size-200" />
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                    <tr id={`pair-indicators-${encodeURIComponent(key)}`} hidden={!expanded[key]} className="border-b border-border bg-secondary/40">
                      <td colSpan={7} className="px-300 py-300">
                        {expanded[key] ? (
                          <div
                            role="region"
                            aria-label={`Schema similarity indicators for ${results.pairModelLabel(pair.idA, pair.idB)} and ${results.pairModelLabel(pair.idB, pair.idA)}`}
                          >
                            <SchemaSignals results={results} pair={pair} />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">
          {results.reviewEmptyText(state, selection)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-300 text-300 text-muted-foreground">
        <span>
          Showing {total ? start + 1 : 0}-{Math.min(start + state.pageSize, total)} of {total}
        </span>
        <span className="flex items-center gap-300">
          <label className="flex items-center gap-200">
            Rows
            <select
              value={state.pageSize}
              onChange={(event) => update({ pageSize: Number(event.target.value), page: 1 })}
              aria-label="Rows per page"
              className={cn(inputClass, 'w-auto')}
            >
              {[25, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <Pager page={page} pages={pages} onPage={(next) => update({ page: next })} />
        </span>
      </div>
    </section>
  );
}
