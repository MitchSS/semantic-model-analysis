import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { SchemaSignals, SecurityTag, type ViewProps } from '@/components/review-view';
import { Field, LinkButton, Metric, MetricGrid, Section, Tag } from '@/components/ui';
import { safeReportUrl } from '@/lib/results/links';
import { score, type DiffRow, type Results, type SectionId } from '@/lib/results/logic';
import type { PayloadPair, ReportEntry } from '@/lib/results/payload';
import { inputClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

export interface CompareSelection {
  a: string;
  b: string;
  openSections: Record<string, boolean>;
}

export function ReportList({ reports }: { reports: ReportEntry[] }) {
  if (!reports.length) return null;
  return (
    <ul className="flex flex-col gap-100 text-300">
      {reports.map((report) => {
        const href = safeReportUrl(report.url);
        return (
          <li key={`${report.workspaceId}|${report.id}`} className="flex flex-wrap gap-x-300 gap-y-100">
            <span className="font-medium">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                  {report.name}
                </a>
              ) : (
                report.name
              )}
            </span>
            <span className="text-muted-foreground">Workspace: {report.workspace}</span>
            <span className="text-muted-foreground">{report.reason || (report.crossWorkspace ? 'Cross-workspace' : 'Same workspace')}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md bg-secondary px-300 py-200 font-mono text-200">{children}</pre>;
}

function DiffRows({
  rows,
  results,
  firstName,
  secondName,
  detailLabel,
  empty,
}: {
  rows: DiffRow[];
  results: Results;
  firstName: string;
  secondName: string;
  detailLabel: string;
  empty: string;
}) {
  if (!rows.length) return <div className="text-300 text-muted-foreground">{empty}</div>;
  return (
    <>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-100">
          <div
            className={cn(
              'flex flex-wrap gap-300 rounded-sm px-200 py-100 text-300',
              row.status === 'shared' && 'text-muted-foreground',
              row.status === 'changed' && 'bg-accent',
              (row.status === 'onlyA' || row.status === 'onlyB') && 'bg-secondary'
            )}
          >
            <span className="min-w-[180px] text-200 font-medium">{results.statusLabel(row.status, firstName, secondName)}</span>
            <span>{row.text}</span>
          </div>
          {row.detail ? (
            <details className="ml-200 text-300">
              <summary className="cursor-pointer text-200 text-muted-foreground">{detailLabel}</summary>
              {'single' in row.detail ? (
                <Formula>{row.detail.single}</Formula>
              ) : (
                <Formula>
                  <strong>{firstName}</strong>
                  {'\n'}
                  {row.detail.a}
                  {'\n\n'}
                  <strong>{secondName}</strong>
                  {'\n'}
                  {row.detail.b}
                </Formula>
              )}
            </details>
          ) : null}
        </div>
      ))}
    </>
  );
}

function SecurityNotice({ pair }: { pair: PayloadPair | undefined }) {
  if (!pair) return <p className="text-300 text-muted-foreground">Security comparison not scored.</p>;
  if (pair.securityStatus === 'different' || pair.securityStatus === 'unknown') {
    const different = pair.securityStatus === 'different';
    return (
      <div role="status" className="rounded-md border border-destructive/40 bg-destructive/5 px-400 py-300 text-300">
        <strong className="text-destructive">{different ? 'Security definitions differ' : 'Security not assessed'}</strong>
        <div className="text-muted-foreground">
          {different
            ? 'Duplicate labels use the overall score. Review the permission differences before considering replacement.'
            : 'Missing, incomplete, or inconsistent security evidence. Run catalog and scoring again; schema scores remain separate.'}
        </div>
      </div>
    );
  }
  return (
    <p className="text-300 text-muted-foreground">
      {pair.securityStatus === 'not_applicable'
        ? 'No model-level security definitions found in either model. Overall equals schema.'
        : 'Matching security definitions. Role assignments and effective user access are not compared.'}
    </p>
  );
}

export function CompareView({
  results,
  state,
  update,
  onHelp,
  selection,
  onSelectionChange,
  backLabel,
  onBack,
  actions,
}: Pick<ViewProps, 'results' | 'state' | 'update' | 'onHelp'> & {
  selection: CompareSelection;
  onSelectionChange: (selection: CompareSelection) => void;
  backLabel: string | null;
  onBack: () => void;
  /** Optional app-only slot (next actions) rendered after the score summary. */
  actions?: (pair: PayloadPair | undefined) => ReactNode;
}) {
  const { a, b } = selection;
  const title = (
    <div className="flex items-center gap-300">
      {backLabel ? (
        <button
          type="button"
          onClick={onBack}
          title={`Back to ${backLabel}`}
          aria-label={`Back to ${backLabel}`}
          className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-input bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="icon-size-200" />
        </button>
      ) : null}
      <h2 className="font-heading text-500 font-semibold tracking-tight">Compare models</h2>
    </div>
  );
  if (results.modelList.length < 2) {
    return (
      <section className="flex flex-col gap-400">
        {title}
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">Two cataloged models are required.</div>
      </section>
    );
  }

  const options = results.modelList.map((entry) => (
    <option key={entry.id} value={entry.id}>
      {results.selectionLabel(entry.id)}
    </option>
  ));
  const controls = (
    <div className="flex flex-wrap items-end gap-300">
      <Field label="Model A">
        <select id="compare-model-a" value={a} title={results.pairModelLabel(a, b)} onChange={(event) => onSelectionChange({ ...selection, a: event.target.value })} className={inputClass}>
          {options}
        </select>
      </Field>
      <button
        type="button"
        onClick={() => onSelectionChange({ ...selection, a: b, b: a })}
        title="Swap models"
        aria-label="Swap selected models"
        className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-md border border-input bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeftRight aria-hidden="true" className="icon-size-200" />
      </button>
      <Field label="Model B">
        <select value={b} title={results.pairModelLabel(b, a)} onChange={(event) => onSelectionChange({ ...selection, b: event.target.value })} className={inputClass}>
          {options}
        </select>
      </Field>
    </div>
  );
  if (a === b) {
    return (
      <section className="flex flex-col gap-400">
        {title}
        {controls}
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">Choose two different models.</div>
      </section>
    );
  }

  const pair = results.pair(a, b);
  const firstName = results.pairModelLabel(a, b);
  const secondName = results.pairModelLabel(b, a);
  const diff = results.compareData(state, results.model(a), results.model(b));
  const toggle = (id: string) => onSelectionChange({ ...selection, openSections: { ...selection.openSections, [id]: !selection.openSections[id] } });
  const section = (id: SectionId, sectionTitle: string, detailLabel = 'Formula text') => {
    const entry = diff.sections[id] ?? { rows: [], shared: 0, diff: 0 };
    return (
      <Section id={id} title={sectionTitle} summary={`${entry.shared} matching / ${entry.diff} different`} open={Boolean(selection.openSections[id])} onToggle={() => toggle(id)}>
        <DiffRows
          rows={entry.rows}
          results={results}
          firstName={firstName}
          secondName={secondName}
          detailLabel={detailLabel}
          empty={state.cmpDiffOnly ? 'No differences.' : 'No cataloged entries.'}
        />
      </Section>
    );
  };

  const reversed = pair ? pair.idA !== a : false;
  const directions = pair
    ? [
        { source: a, target: b, label: 'A within B', value: reversed ? pair.bInA : pair.aInB },
        { source: b, target: a, label: 'B within A', value: reversed ? pair.aInB : pair.bInA },
      ]
    : [];
  const reports = results.reports;
  const reportSummary = reports.status === 'complete' ? 'Observed direct links' : reports.status === 'partial' ? 'Scan incomplete' : 'Dependencies unknown';
  const evidence = pair?.securityEvidence ?? {};
  const components = evidence.components ?? {};
  const weights = evidence.effective_weights ?? {};

  return (
    <section className="flex flex-col gap-400">
      {title}
      {controls}
      <div className="flex flex-col gap-300 rounded-md border border-border bg-card px-400 py-300">
        <div className="flex flex-wrap items-center gap-300">
          <span className="font-medium">{results.relationshipSummary(state, pair)}</span>
          <SecurityTag results={results} pair={pair} />
          {!results.inComparisonScope(state, a, b) ? <Tag warning>Outside scope: {results.scopeExclusion(a, b)}</Tag> : null}
          <label className="flex items-center gap-200 text-300 text-muted-foreground">
            <input type="checkbox" checked={state.cmpDiffOnly} onChange={(event) => update({ cmpDiffOnly: event.target.checked })} className="accent-[var(--color-primary)]" />
            Differences only
          </label>
        </div>
        <dl className="grid grid-cols-1 gap-200 sm:grid-cols-3">
          <Metric label="Schema" value={pair?.schema} unavailable={pair ? 'Unavailable' : 'Not scored'} />
          <Metric label="Security" value={pair?.security} unavailable={pair ? results.securityScoreText(pair) : 'Not scored'} />
          <Metric label="Overall" value={pair?.combined} unavailable={pair ? 'Unavailable' : 'Not scored'} />
        </dl>
        <div className="flex flex-wrap items-start justify-between gap-400">
          {pair ? (
            <dl aria-label="Directional schema coverage" className="flex flex-wrap gap-400 text-300">
              {directions.map((direction) => {
                const full = `${results.pairModelLabel(direction.source, direction.target)} within ${results.pairModelLabel(direction.target, direction.source)}`;
                return (
                  <div key={direction.label}>
                    <dt title={full} className="text-200 text-muted-foreground">
                      Schema coverage: {direction.label}
                    </dt>
                    <dd aria-label={`${full}: ${score(direction.value)}`} className="font-numeric font-semibold tabular-nums">
                      {score(direction.value)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <span className="text-300 text-muted-foreground">Coverage: Not scored</span>
          )}
          <div className="text-300 text-muted-foreground">
            Schema entries
            <br />
            <strong className="text-foreground">
              {diff.shared} matching / {diff.differences} different
            </strong>
          </div>
        </div>
        <SecurityNotice pair={pair} />
        {actions ? actions(pair) : null}
      </div>

      <Section
        id="security"
        title="Security definitions"
        summary={results.securityLabel(pair)}
        open={Boolean(selection.openSections.security)}
        onToggle={() => toggle('security')}
      >
        <p className="text-300 text-muted-foreground">
          The app shows the saved security comparison. Open notebook 002 to inspect role-by-role rule differences.
        </p>
        <ul className="flex flex-col gap-100 text-300">
          {[a, b].map((id) => (
            <li key={id}>
              <span className="font-medium">{results.pairModelLabel(id, id === a ? b : a)}</span>: {results.modelSecurityText(id)}
            </li>
          ))}
        </ul>
      </Section>
      {section('tables', 'Tables')}
      {section('columns', 'Columns')}
      {section('measures', 'Measures')}
      {section('queries', 'Power Query', 'M query')}
      {section('relationships', 'Relationships')}
      {section('datasources', 'Sources')}
      <Section id="reports" title="Dependent reports" summary={reportSummary} open={Boolean(selection.openSections.reports)} onToggle={() => toggle('reports')}>
        <div className="flex flex-wrap items-center gap-300 text-200">
          <span className={reports.status === 'complete' ? 'text-muted-foreground' : 'text-destructive'}>Report scan: {results.shortReportStatus()}</span>
          <span className="text-muted-foreground">{results.reportScopeText()}</span>
          <LinkButton onClick={onHelp}>Scan details</LinkButton>
        </div>
        <div className="grid grid-cols-1 gap-400 md:grid-cols-2">
          {[a, b].map((id) => (
            <div key={id} className="flex flex-col gap-100">
              <h3 className="font-heading text-400 font-semibold">{results.model(id).name}</h3>
              <div className="text-200 text-muted-foreground">{results.model(id).workspace || 'Unavailable'}</div>
              <div className="text-300">{results.compareReportCount(id)}</div>
              <ReportList reports={results.reportsFor(id)} />
            </div>
          ))}
        </div>
      </Section>
      <Section id="scores" title="Score breakdown" summary="Schema / security signals" open={Boolean(selection.openSections.scores)} onToggle={() => toggle('scores')}>
        {pair ? (
          <>
            <h4 className="font-heading text-300 font-semibold">Overall {score(pair.combined)}</h4>
            <p className="text-300 text-muted-foreground">{results.blendText(pair)}</p>
            <h4 className="font-heading text-300 font-semibold">Schema signals</h4>
            <SchemaSignals results={results} pair={pair} />
            <h4 className="font-heading text-300 font-semibold">Security signals</h4>
            {pair.securityStatus === 'match' || pair.securityStatus === 'different' ? (
              <>
                <MetricGrid>
                  <Metric label="Role definitions" value={components.role_definitions} />
                  <Metric label="RLS propagation" value={components.rls_propagation} unavailable="Not applicable" />
                </MetricGrid>
                <p className="text-300 text-muted-foreground">
                  Effective security weights:{' '}
                  {Object.keys(weights)
                    .map((key) => `${key === 'role_definitions' ? 'Role definitions' : 'RLS propagation'} ${score(weights[key])}`)
                    .join(' · ')}
                  .
                </p>
              </>
            ) : null}
            <div>
              <LinkButton onClick={onHelp}>Calculation definitions</LinkButton>
            </div>
          </>
        ) : (
          <p className="text-300 text-muted-foreground">No saved pair score.</p>
        )}
      </Section>
    </section>
  );
}
