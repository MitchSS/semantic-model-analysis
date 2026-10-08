import { ArrowRight, ArrowDownUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState, FindingBadge, ScoreBar, SecurityBadge, SectionHeading } from '@/components/ui';
import { inputClass, buttonClass } from '@/lib/styles';
import {
  FINDING_LABELS,
  compareScores,
  type Finding,
  type PairView,
  type SimilarityDataset,
} from '@/lib/similarity-model';
import { cn } from '@/lib/utils';

type SortKey = 'combined' | 'schema' | 'security' | 'coverage';
const PAGE_SIZE = 25;
const REVIEW_FINDINGS: Finding[] = ['duplicate', 'coverage', 'similar'];

const coverage = (pair: PairView) =>
  pair.aInB === null && pair.bInA === null ? null : Math.max(pair.aInB ?? 0, pair.bInA ?? 0);

export function ReviewView({
  dataset,
  pairs,
  onCompare,
}: {
  dataset: SimilarityDataset;
  pairs: PairView[];
  onCompare: (pair: PairView) => void;
}) {
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<Finding | 'review'>('review');
  const [securityDiffOnly, setSecurityDiffOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('combined');
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    const result: Record<Finding, number> = { duplicate: 0, coverage: 0, similar: 0, distinct: 0, unassessed: 0 };
    for (const pair of pairs) result[pair.finding] += 1;
    return result;
  }, [pairs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const value = (pair: PairView) =>
      sort === 'coverage' ? coverage(pair) : sort === 'schema' ? pair.schema : sort === 'security' ? pair.security : pair.combined;
    return pairs
      .filter((pair) => (finding === 'review' ? REVIEW_FINDINGS.includes(pair.finding) : pair.finding === finding))
      .filter((pair) => !securityDiffOnly || pair.securityState === 'different')
      .filter(
        (pair) =>
          !needle ||
          `${pair.a.name} ${pair.a.workspace} ${pair.b.name} ${pair.b.workspace}`.toLowerCase().includes(needle)
      )
      .sort((x, y) => compareScores(value(x), value(y)));
  }, [pairs, finding, securityDiffOnly, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        setSort(key);
        setPage(0);
      }}
      aria-pressed={sort === key}
      className={cn('inline-flex items-center gap-100 font-medium hover:text-foreground', sort === key ? 'text-foreground' : 'text-muted-foreground')}
    >
      {label}
      <ArrowDownUp aria-hidden="true" className={cn('icon-size-100', sort !== key && 'opacity-40')} />
    </button>
  );

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-400">
      <SectionHeading
        id="review-heading"
        title="Review queue"
        detail={`${dataset.models.length} catalog models · ${pairs.length} scored comparisons in scope`}
      />

      <div className="grid grid-cols-2 gap-300 md:grid-cols-4">
        {(['duplicate', 'coverage', 'similar', 'unassessed'] as Finding[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFinding(finding === key ? 'review' : key);
              setPage(0);
            }}
            aria-pressed={finding === key}
            className={cn(
              'flex flex-col items-start gap-100 rounded-md border bg-card px-400 py-300 text-left transition hover:border-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              finding === key ? 'border-primary ring-1 ring-primary' : 'border-border'
            )}
          >
            <span className="font-numeric text-hero-700 font-semibold leading-hero-700 tabular-nums">{counts[key]}</span>
            <span className="text-200 text-muted-foreground">{FINDING_LABELS[key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-300">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search models or workspaces</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search models or workspaces"
            className={inputClass}
          />
        </label>
        <div className="flex items-center gap-200 text-300">
          <label htmlFor="review-finding" className="text-muted-foreground">Finding</label>
          <select
            id="review-finding"
            value={finding}
            onChange={(event) => {
              setFinding(event.target.value as Finding | 'review');
              setPage(0);
            }}
            className={cn(inputClass, 'w-auto')}
          >
            <option value="review">All review candidates</option>
            {(Object.keys(FINDING_LABELS) as Finding[]).map((key) => (
              <option key={key} value={key}>
                {FINDING_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-200 text-300 text-muted-foreground">
          <input
            type="checkbox"
            checked={securityDiffOnly}
            onChange={(event) => {
              setSecurityDiffOnly(event.target.checked);
              setPage(0);
            }}
            className="accent-[var(--color-primary)]"
          />
          Security differs only
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No comparisons match">
          Adjust the search or filters. A missing pair is not a zero score — blocking may have excluded it.
        </EmptyState>
      ) : (
        <div className="overflow-auto rounded-md border border-border bg-card" role="region" aria-label="Ranked comparisons" tabIndex={0}>
          <table className="w-full min-w-[880px] border-collapse text-left text-300">
            <thead className="border-b border-border bg-secondary text-200 uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-300 py-200 font-medium">Finding</th>
                <th scope="col" className="px-300 py-200 font-medium">Models</th>
                <th scope="col" className="px-300 py-200">{sortButton('combined', 'Overall')}</th>
                <th scope="col" className="px-300 py-200">{sortButton('schema', 'Schema')}</th>
                <th scope="col" className="px-300 py-200">{sortButton('coverage', 'Coverage')}</th>
                <th scope="col" className="px-300 py-200 font-medium">Security</th>
                <th scope="col" className="px-300 py-200"><span className="sr-only">Compare</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((pair) => (
                <tr key={pair.key} className="border-b border-border last:border-0 hover:bg-[var(--color-hover)]">
                  <td className="px-300 py-200 align-top"><FindingBadge finding={pair.finding} /></td>
                  <td className="px-300 py-200 align-top">
                    <div className="font-medium text-foreground">{pair.a.name}</div>
                    <div className="text-200 text-muted-foreground">{pair.a.workspace}</div>
                    <div className="mt-100 font-medium text-foreground">{pair.b.name}</div>
                    <div className="text-200 text-muted-foreground">
                      {pair.b.workspace}
                      {pair.crossWorkspace ? <span className="ml-200 rounded-sm bg-muted px-100">cross-workspace</span> : null}
                    </div>
                  </td>
                  <td className="px-300 py-200 align-top"><ScoreBar value={pair.combined} label="Overall" emphasis /></td>
                  <td className="px-300 py-200 align-top"><ScoreBar value={pair.schema} label="Schema" /></td>
                  <td className="px-300 py-200 align-top"><ScoreBar value={coverage(pair)} label="Best coverage" /></td>
                  <td className="px-300 py-200 align-top"><SecurityBadge state={pair.securityState} /></td>
                  <td className="px-300 py-200 text-right align-top">
                    <button type="button" className={buttonClass('ghost')} onClick={() => onCompare(pair)} aria-label={`Compare ${pair.a.name} and ${pair.b.name}`}>
                      Compare <ArrowRight aria-hidden="true" className="icon-size-200" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > PAGE_SIZE ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-300 text-muted-foreground">
          <span>
            {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of {filtered.length}
          </span>
          <span className="flex gap-200">
            <button type="button" className={buttonClass()} disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
            <button type="button" className={buttonClass()} disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</button>
          </span>
        </nav>
      ) : null}
    </section>
  );
}
