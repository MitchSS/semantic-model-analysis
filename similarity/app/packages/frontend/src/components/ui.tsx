import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { score, validScore } from '@/lib/results/logic';
import { cn } from '@/lib/utils';

/** Score with a bar; unavailable values are labelled, never drawn as a zero bar (002 `scoreCellHTML`). */
export function ScoreCell({ value, unavailable = 'Unavailable', emphasis = false }: { value: number | null | undefined; unavailable?: string; emphasis?: boolean }) {
  if (!validScore(value)) {
    return <span className="text-200 italic text-muted-foreground">{unavailable}</span>;
  }
  return (
    <span className="flex min-w-[96px] items-center gap-200">
      <span className={cn('w-[48px] text-right font-numeric text-300 tabular-nums', emphasis && 'font-semibold')}>{score(value)}</span>
      <span aria-hidden="true" className="relative h-100 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', emphasis ? 'bg-primary' : 'bg-primary/50')} style={{ width: `${value * 100}%` }} />
      </span>
    </span>
  );
}

/** Labelled metric with a 0–100% meter (002 `metricHTML`). */
export function Metric({ label, value, unavailable = 'Unavailable' }: { label: string; value: number | null | undefined; unavailable?: string }) {
  const available = validScore(value);
  return (
    <div className="flex flex-col gap-100 rounded-md border border-border bg-card px-300 py-200">
      <dt className="text-200 text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-100">
        <span className={cn('font-numeric text-400 font-semibold tabular-nums', !available && 'text-300 font-normal italic text-muted-foreground')}>
          {available ? score(value) : unavailable}
        </span>
        {available ? (
          <span
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value * 1000) / 10}
            aria-valuetext={score(value)}
            className="relative block h-100 overflow-hidden rounded-full bg-muted"
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${value * 100}%` }} />
          </span>
        ) : (
          <span aria-hidden="true" className="block h-100 rounded-full border border-dashed border-border" />
        )}
      </dd>
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-200 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>;
}

export function Tag({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-sm px-200 py-100 text-200',
        warning ? 'bg-destructive/10 font-medium text-destructive' : 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

export function LinkButton({ children, onClick, warning = false }: { children: ReactNode; onClick: () => void; warning?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-sm px-100 text-200 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        warning ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="flex w-full flex-wrap items-center justify-between gap-300 px-400 py-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-heading text-400 font-semibold">{title}</span>
        <span className="flex items-center gap-200 text-200 text-muted-foreground">
          {summary}
          <ChevronDown aria-hidden="true" className={cn('icon-size-200 transition', open && 'rotate-180')} />
        </span>
      </button>
      <div id={`section-${id}`} hidden={!open} className="flex flex-col gap-200 border-t border-border px-400 py-300">
        {children}
      </div>
    </section>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'error' | 'warning';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-start justify-between gap-300 rounded-md border px-400 py-300',
        tone === 'error' && 'border-destructive/50 bg-destructive/5',
        tone === 'warning' && 'border-primary/40 bg-accent',
        tone === 'info' && 'border-border bg-card'
      )}
    >
      <div className="min-w-0">
        <p className={cn('text-300 font-semibold', tone === 'error' ? 'text-destructive' : 'text-foreground')}>{title}</p>
        {children ? <div className="mt-100 text-300 text-muted-foreground">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-200 rounded-md border border-dashed border-border px-600 py-800 text-center">
      {title ? <p className="font-heading text-400 font-semibold text-foreground">{title}</p> : null}
      {children ? <div className="max-w-[560px] text-300 text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-200" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-[36px] animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

export function SectionHeading({ id, title, detail, children }: { id?: string; title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-300">
      <div>
        <h2 id={id} className="font-heading text-500 font-semibold tracking-tight text-foreground">{title}</h2>
        {detail ? <p className="mt-100 text-300 text-muted-foreground">{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[160px] flex-col gap-100 text-200 text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function Pager({
  page,
  pages,
  onPage,
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
}) {
  const button =
    'inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-input bg-card text-400 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <span className="flex items-center gap-200">
      <button type="button" className={button} aria-label={previousLabel} title={previousLabel} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span className="font-numeric tabular-nums">
        {page} / {pages}
      </span>
      <button type="button" className={button} aria-label={nextLabel} title={nextLabel} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </span>
  );
}
