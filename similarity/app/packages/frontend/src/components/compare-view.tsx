import { VegaVisual, useCssTheme, type VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';

import { EmptyState, FindingBadge, ScoreBar, SecurityBadge, SectionHeading } from '@/components/ui';
import { buttonClass, inputClass } from '@/lib/styles';
import {
  formatPercent,
  modelLabel,
  pairKey,
  type ModelRef,
  type ModelStats,
  type PairView,
  type SimilarityDataset,
} from '@/lib/similarity-model';

const SIGNAL_LABELS: Array<[keyof PairView['signals'], string]> = [
  ['tables', 'Table names'],
  ['columns', 'Column names'],
  ['measureNames', 'Measure names'],
  ['daxText', 'DAX text similarity'],
  ['relationships', 'Relationships'],
  ['datasources', 'Data sources'],
];

const signalSpec: VisualizationSpec = {
  mark: { type: 'bar', cornerRadiusEnd: 2 },
  encoding: {
    y: { field: 'signal', type: 'nominal', sort: null, title: null },
    x: {
      field: 'overlap',
      type: 'quantitative',
      scale: { domain: [0, 1] },
      axis: { format: '.0%' },
      title: 'Overlap',
    },
    tooltip: [
      { field: 'signal', type: 'nominal', title: 'Signal' },
      { field: 'overlap', type: 'quantitative', format: '.0%', title: 'Overlap' },
    ],
  },
};

function StatsTable({ a, b, statsA, statsB }: { a: ModelRef; b: ModelRef; statsA?: ModelStats; statsB?: ModelStats }) {
  const rows: Array<[string, keyof ModelStats]> = [
    ['Tables', 'tables'],
    ['Columns', 'columns'],
    ['Measures', 'measures'],
    ['Relationships', 'relationships'],
    ['Data sources', 'datasources'],
    ['Roles', 'roles'],
  ];
  const show = (value: ModelStats[keyof ModelStats] | undefined) => (value === null || value === undefined ? '—' : String(value));
  return (
    <table className="w-full border-collapse text-left text-300">
      <caption className="sr-only">Catalog counts</caption>
      <thead className="text-200 uppercase tracking-wide text-muted-foreground">
        <tr>
          <th scope="col" className="py-100 pr-300 font-medium">Counts</th>
          <th scope="col" className="py-100 pr-300 font-medium">{a.name}</th>
          <th scope="col" className="py-100 font-medium">{b.name}</th>
        </tr>
      </thead>
      <tbody className="font-numeric tabular-nums">
        {rows.map(([label, key]) => (
          <tr key={key} className="border-t border-border">
            <th scope="row" className="py-100 pr-300 font-base font-normal text-muted-foreground">{label}</th>
            <td className="py-100 pr-300">{show(statsA?.[key])}</td>
            <td className="py-100">{show(statsB?.[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CompareView({
  dataset,
  modelA,
  modelB,
  onChange,
  onBack,
}: {
  dataset: SimilarityDataset;
  modelA: string | null;
  modelB: string | null;
  onChange: (a: string | null, b: string | null) => void;
  onBack: (() => void) | null;
}) {
  const theme = useCssTheme();
  const a = dataset.models.find((m) => m.id === modelA) ?? null;
  const b = dataset.models.find((m) => m.id === modelB) ?? null;
  const pair = useMemo(
    () => (a && b ? dataset.pairs.find((p) => p.key === pairKey(a.id, b.id)) ?? null : null),
    [a, b, dataset.pairs]
  );
  // Pair rows are stored A→B; flip coverage when the user's order differs.
  const flipped = !!pair && !!a && pair.a.id !== a.id;
  const aInB = pair ? (flipped ? pair.bInA : pair.aInB) : null;
  const bInA = pair ? (flipped ? pair.aInB : pair.bInA) : null;

  const signalData = useMemo<DataTable | null>(() => {
    if (!pair) return null;
    const rows = SIGNAL_LABELS.filter(([key]) => pair.signals[key] !== null).map(([key, label]) => [label, pair.signals[key]]);
    return rows.length
      ? { columns: [{ name: 'signal', displayName: 'Signal' }, { name: 'overlap', displayName: 'Overlap', format: '0%' }], rows }
      : null;
  }, [pair]);

  const reportsFor = (model: ModelRef | null) => (model ? dataset.reports.filter((r) => r.modelId === model.id) : []);

  const selector = (label: string, value: string | null, onSelect: (id: string | null) => void) => {
    const id = `compare-${label.replace(/\s+/g, '-').toLowerCase()}`;
    return (
      <div className="flex min-w-[240px] flex-1 flex-col gap-100 text-200">
        <label htmlFor={id} className="text-muted-foreground">{label}</label>
        <select id={id} value={value ?? ''} onChange={(event) => onSelect(event.target.value || null)} className={inputClass}>
          <option value="">Select a model</option>
          {dataset.models.map((model) => (
            <option key={model.id} value={model.id}>
              {modelLabel(model)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <section aria-labelledby="compare-heading" className="flex flex-col gap-400">
      <SectionHeading id="compare-heading" title="Compare models">
        {onBack ? (
          <button type="button" className={buttonClass('ghost')} onClick={onBack}>
            <ArrowLeft aria-hidden="true" className="icon-size-200" /> Back
          </button>
        ) : null}
      </SectionHeading>

      <div className="flex flex-wrap gap-300">
        {selector('Model A', modelA, (id) => onChange(id, modelB))}
        {selector('Model B', modelB, (id) => onChange(modelA, id))}
      </div>

      {!a || !b ? (
        <EmptyState title="Choose two models">Pick any two catalog models, or open a comparison from Review, Groups or the map.</EmptyState>
      ) : a.id === b.id ? (
        <EmptyState title="Choose two different models" />
      ) : (
        <>
          {pair ? (
            <div className="flex flex-wrap items-center gap-300">
              <FindingBadge finding={pair.finding} />
              <SecurityBadge state={pair.securityState} />
              {pair.crossWorkspace ? <span className="text-200 text-muted-foreground">Cross-workspace</span> : null}
            </div>
          ) : (
            <p role="status" className="rounded-md border border-dashed border-input px-400 py-300 text-300 text-muted-foreground">
              <strong className="text-foreground">Not scored.</strong> This pair is absent from the saved results — candidate blocking
              commonly excludes models that share no table or measure names. It is not a 0% match.
            </p>
          )}

          <div className="grid gap-300 sm:grid-cols-3">
            {[
              ['Overall', pair?.combined ?? null, 'Combined schema and security similarity'],
              ['Schema', pair?.schema ?? null, 'Structural and text overlap'],
              ['Security', pair?.security ?? null, pair?.securityState === 'not_applicable' ? 'Not applicable — no roles' : 'Similarity of role definitions'],
            ].map(([label, value, hint]) => (
              <div key={label as string} className="rounded-md border border-border bg-card px-400 py-300">
                <p className="text-200 uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="font-numeric text-hero-800 font-semibold leading-hero-800 tabular-nums text-foreground">
                  {formatPercent(value as number | null)}
                </p>
                <ScoreBar value={value as number | null} label={label as string} emphasis={label === 'Overall'} />
                <p className="mt-100 text-200 text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-400 lg:grid-cols-2">
            <div className="flex flex-col gap-300 rounded-md border border-border bg-card p-400">
              <h3 className="font-heading text-400 font-semibold">Schema coverage</h3>
              <p className="text-200 text-muted-foreground">Directional: how much of one model's schema is represented in the other. Separate from Overall.</p>
              <div className="flex flex-col gap-200 text-300">
                <span>{a.name} within {b.name}</span>
                <ScoreBar value={aInB} label={`${a.name} within ${b.name}`} />
                <span>{b.name} within {a.name}</span>
                <ScoreBar value={bInA} label={`${b.name} within ${a.name}`} />
              </div>
              <StatsTable a={a} b={b} statsA={dataset.stats[a.id]} statsB={dataset.stats[b.id]} />
            </div>

            <div className="flex flex-col gap-300 rounded-md border border-border bg-card p-400">
              <h3 className="font-heading text-400 font-semibold">Schema signals</h3>
              {signalData ? (
                <div className="h-[240px]">
                  <VegaVisual spec={signalSpec} data={signalData} theme={theme} style={{ height: '100%' }} />
                </div>
              ) : (
                <p className="text-300 text-muted-foreground">No signal evidence saved for this pair.</p>
              )}
            </div>
          </div>

          <div className="grid gap-400 lg:grid-cols-2">
            {[a, b].map((model) => {
              const reports = reportsFor(model);
              return (
                <div key={model.id} className="rounded-md border border-border bg-card p-400">
                  <h3 className="font-heading text-400 font-semibold">Dependent reports · {model.name}</h3>
                  {reports.length ? (
                    <ul className="mt-200 flex flex-col gap-100 text-300">
                      {reports.map((report, index) => (
                        <li key={`${report.name}-${index}`} className="flex items-center justify-between gap-300">
                          <span className="min-w-0 truncate">
                            {report.name} <span className="text-muted-foreground">· {report.workspace}</span>
                          </span>
                          {report.url ? (
                            <a href={report.url} target="_blank" rel="noreferrer noopener" className={buttonClass('ghost')} aria-label={`Open ${report.name}`}>
                              <ExternalLink aria-hidden="true" className="icon-size-200" />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-200 text-300 text-muted-foreground">No reports found in the scanned scope. This does not prove the model is unused.</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
