import { ChevronRight, GitCompareArrows } from 'lucide-react';
import { Fragment, useState } from 'react';

import { ReportList } from '@/components/compare-view';
import { ReportRebindRow, TrustPanel } from '@/components/next-actions';
import { SecurityTag, StatusStrip, type ViewProps } from '@/components/review-view';
import { Field, Notice, ScoreCell, Tag } from '@/components/ui';
import { trustedModelFor, type ActionsState } from '@/hooks/use-actions';
import { consolidationCandidates, suggestedTargets, trustedModelIds } from '@/lib/actions';
import { LABELS, type FindingKind } from '@/lib/results/logic';
import { inputClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

const PICKER_LIMIT = 50;

/**
 * Consolidation workspace (app only; replaces notebook 002's Groups tab here): pick any model as the
 * trusted target, review every model it duplicates, covers or overlaps, and move their reports to it.
 */
export function ConsolidationView({
  results,
  state,
  onHelp,
  onCompare,
  actions,
  targetId,
  onTargetChange,
}: Omit<ViewProps, 'update'> & { actions: ActionsState; targetId: string | null; onTargetChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [workspace, setWorkspace] = useState('all');
  const [finding, setFinding] = useState<'all' | FindingKind>('all');
  const [onlyReports, setOnlyReports] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const trusted = trustedModelIds(actions.decisions, actions.approvers);
  const suggestions = suggestedTargets(results, state, trusted);
  const query = search.trim().toLowerCase();
  const matches = suggestions.filter(({ id }) => {
    const model = results.model(id);
    return (!query || `${model.name} ${model.workspace}`.toLowerCase().includes(query)) && (workspace === 'all' || results.workspaceKey(id) === workspace);
  });
  const target = targetId && results.data.models[targetId] ? targetId : (suggestions[0]?.id ?? null);

  const picker = (
    <aside aria-label="Choose a target model" className="flex flex-col gap-300">
      <Field label="Search">
        <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search target models" placeholder="Models or workspaces" className={inputClass} />
      </Field>
      <Field label="Workspace">
        <select value={workspace} onChange={(event) => setWorkspace(event.target.value)} aria-label="Target workspace" className={inputClass}>
          <option value="all">All workspaces</option>
          {results.workspaceOptions().map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <ul className="flex max-h-[560px] flex-col overflow-auto rounded-md border border-border bg-card" aria-label="Target models">
        {matches.slice(0, PICKER_LIMIT).map((entry) => {
          const model = results.model(entry.id);
          const active = entry.id === target;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => {
                  onTargetChange(entry.id);
                  setExpanded({});
                }}
                aria-pressed={active}
                className={cn(
                  'flex w-full flex-col gap-100 border-b border-border px-300 py-200 text-left last:border-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-accent'
                )}
              >
                <span className="flex items-center justify-between gap-200">
                  <span className="font-medium">{model.name}</span>
                  {entry.trusted ? <Tag>Trusted</Tag> : null}
                </span>
                <span className="text-200 text-muted-foreground">
                  {model.workspace || 'Unknown workspace'} · {entry.candidates} candidate{entry.candidates === 1 ? '' : 's'} · {entry.reports} report{entry.reports === 1 ? '' : 's'} to review
                </span>
              </button>
            </li>
          );
        })}
        {!matches.length ? <li className="px-300 py-300 text-300 text-muted-foreground">No models match.</li> : null}
      </ul>
      {matches.length > PICKER_LIMIT ? <p className="text-200 text-muted-foreground">Showing the first {PICKER_LIMIT} of {matches.length}. Search to narrow.</p> : null}
    </aside>
  );

  if (!target) {
    return (
      <section className="flex flex-col gap-400">
        <h2 className="font-heading text-500 font-semibold tracking-tight">Consolidation</h2>
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">No cataloged models.</div>
      </section>
    );
  }

  const model = results.model(target);
  const approved = trustedModelFor(actions.decisions, [target], actions.approvers).approved;
  const all = consolidationCandidates(results, state, target);
  const counts: Record<FindingKind, number> = { duplicate: 0, containment: 0, overlap: 0 };
  all.forEach((candidate) => counts[candidate.category.kind]++);
  const rows = all.filter((candidate) => (finding === 'all' || candidate.category.kind === finding) && (!onlyReports || candidate.reports.length));
  const reportCount = rows.reduce((sum, candidate) => sum + candidate.reports.length, 0);

  return (
    <section aria-labelledby="consolidation-heading" className="flex flex-col gap-400">
      <div>
        <h2 id="consolidation-heading" className="font-heading text-500 font-semibold tracking-tight">
          Consolidation
        </h2>
        <p className="mt-100 text-300 text-muted-foreground">
          Pick the model to keep. Review the models it duplicates, covers or overlaps, approve it as trusted, then move their reports to it.
        </p>
      </div>
      <StatusStrip results={results} state={state} onHelp={onHelp} />
      {actions.error ? <Notice tone="error" title={actions.error} /> : null}
      <div className="grid grid-cols-1 gap-400 lg:grid-cols-[320px_1fr]">
        {picker}
        <div className="flex min-w-0 flex-col gap-400">
          <section aria-labelledby="target-title" className="flex flex-col gap-300 rounded-md border border-border bg-card px-400 py-300">
            <div>
              <h3 id="target-title" className="font-heading text-400 font-semibold">
                {model.name}
              </h3>
              <div className="text-200 text-muted-foreground">
                {model.workspace || 'Unknown workspace'} · {results.modelSecurityText(target)} · {results.reportCountText(target)}
              </div>
            </div>
            <TrustPanel key={target} results={results} targetId={target} actions={actions} />
          </section>

          <div className="flex flex-wrap items-end justify-between gap-300">
            <h3 className="font-heading text-400 font-semibold">Models to consolidate into {model.name}</h3>
            <div className="flex flex-wrap items-end gap-300">
              <Field label="Finding">
                <select value={finding} onChange={(event) => setFinding(event.target.value as 'all' | FindingKind)} aria-label="Candidate finding" className={inputClass}>
                  <option value="all">All findings ({all.length})</option>
                  {(['duplicate', 'containment', 'overlap'] as FindingKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {LABELS[kind]} ({counts[kind]})
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-200 pb-200 text-300 text-muted-foreground">
                <input type="checkbox" checked={onlyReports} onChange={(event) => setOnlyReports(event.target.checked)} className="accent-[var(--color-primary)]" />
                Only models with reports
              </label>
            </div>
          </div>
          <span role="status" className="text-300 text-muted-foreground">
            {rows.length} of {all.length} models · {reportCount} linked report{reportCount === 1 ? '' : 's'}
          </span>

          {!approved && reportCount ? (
            <p className="text-300 text-muted-foreground">Approve {model.name} as a trusted model to plan report rebinds.</p>
          ) : null}

          {rows.length ? (
            <div className="overflow-auto rounded-md border border-border bg-card" role="region" aria-label="Consolidation candidates" tabIndex={0}>
              <table className="w-full min-w-[880px] border-collapse text-left text-300">
                <thead className="border-b border-border bg-secondary text-200 text-muted-foreground">
                  <tr>
                    {['Model', 'Finding', 'Overall', 'Coverage within target', 'Security', 'Reports'].map((label) => (
                      <th key={label} scope="col" className="px-300 py-200 font-medium">
                        {label}
                      </th>
                    ))}
                    <th scope="col" className="px-300 py-200">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((candidate) => {
                    const other = results.model(candidate.id);
                    const open = Boolean(expanded[candidate.id]);
                    return (
                      <Fragment key={candidate.id}>
                        <tr className="border-b border-border hover:bg-[var(--color-hover)]">
                          <td className="px-300 py-200 align-top">
                            <button
                              type="button"
                              onClick={() => setExpanded((current) => ({ ...current, [candidate.id]: !current[candidate.id] }))}
                              aria-expanded={open}
                              aria-controls={`candidate-${candidate.id}`}
                              aria-label={`Reports for ${other.name}`}
                              className="flex items-center gap-100 text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {other.name}
                              <ChevronRight aria-hidden="true" className={cn('icon-size-200 shrink-0 transition', open && 'rotate-90')} />
                            </button>
                            <div className="text-200 text-muted-foreground">{other.workspace || 'Unknown workspace'}</div>
                            {trusted.has(candidate.id) ? <Tag warning>Also trusted</Tag> : null}
                          </td>
                          <td className="px-300 py-200 align-top font-medium">{candidate.category.label}</td>
                          <td className="px-300 py-200 align-top">
                            <ScoreCell value={candidate.pair.combined} emphasis />
                          </td>
                          <td className="px-300 py-200 align-top">
                            <ScoreCell value={candidate.coverage} />
                          </td>
                          <td className="px-300 py-200 align-top">
                            <SecurityTag results={results} pair={candidate.pair} />
                          </td>
                          <td className="px-300 py-200 align-top">{results.shortReportCount(candidate.id)}</td>
                          <td className="px-300 py-200 text-right align-top">
                            <button
                              type="button"
                              onClick={() => onCompare(target, candidate.id, results.relevantSection(candidate.pair))}
                              title="Compare models"
                              aria-label={`Compare ${model.name} and ${other.name}`}
                              className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-input bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <GitCompareArrows aria-hidden="true" className="icon-size-200" />
                            </button>
                          </td>
                        </tr>
                        <tr id={`candidate-${candidate.id}`} hidden={!open} className="border-b border-border bg-secondary/40">
                          <td colSpan={7} className="px-300 py-200">
                            {open ? (
                              !results.reportsAvailable() ? (
                                <p className="text-300 text-muted-foreground">Report dependencies are unknown. Run the analysis with a report scan first.</p>
                              ) : !candidate.reports.length ? (
                                <p className="text-300 text-muted-foreground">No linked reports found for {other.name}.</p>
                              ) : approved ? (
                                <ul className="flex flex-col divide-y divide-border">
                                  {candidate.reports.map((report) => (
                                    <ReportRebindRow
                                      key={`${report.workspaceId}|${report.id}`}
                                      results={results}
                                      state={state}
                                      actions={actions}
                                      report={report}
                                      fromId={candidate.id}
                                      trusted={{ modelId: target, modelName: model.name }}
                                    />
                                  ))}
                                </ul>
                              ) : (
                                <ReportList reports={candidate.reports} />
                              )
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
              {all.length
                ? 'No models match these filters.'
                : state.crossOnly
                  ? `No cross-workspace review candidates involve ${model.name} at the current thresholds.`
                  : `No review candidates involve ${model.name} at the current thresholds.`}
            </div>
          )}
          {approved ? (
            <p className="text-200 text-muted-foreground">
              <strong>Rebind now</strong> runs as the app owner through the Power BI API, only for plans approved by an approver, and only if the report still uses the planned model. Use{' '}
              <strong>Run it yourself</strong> to make the same change under your own account. Report links here update after the next analysis run.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
