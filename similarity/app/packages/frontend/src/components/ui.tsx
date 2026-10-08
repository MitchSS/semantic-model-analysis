import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  FINDING_LABELS,
  SECURITY_LABELS,
  formatPercent,
  type Finding,
  type SecurityState,
} from '@/lib/similarity-model';

export function ScoreBar({ value, label, emphasis = false }: { value: number | null; label: string; emphasis?: boolean }) {
  const pct = value === null ? null : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex min-w-[96px] items-center gap-200" aria-label={`${label}: ${value === null ? 'unavailable' : formatPercent(value)}`}>
      <span className={cn('w-[40px] text-right font-numeric text-300 tabular-nums', emphasis ? 'font-semibold' : 'text-muted-foreground')}>
        {formatPercent(value)}
      </span>
      <span aria-hidden="true" className="relative h-100 flex-1 overflow-hidden rounded-full bg-muted">
        {pct !== null ? (
          <span className={cn('absolute inset-y-0 left-0 rounded-full', emphasis ? 'bg-primary' : 'bg-primary/50')} style={{ width: `${pct}%` }} />
        ) : null}
      </span>
    </div>
  );
}

const FINDING_TONE: Record<Finding, string> = {
  duplicate: 'bg-primary text-primary-foreground',
  coverage: 'bg-accent text-accent-foreground',
  similar: 'border border-primary/40 text-foreground',
  distinct: 'bg-muted text-muted-foreground',
  unassessed: 'border border-dashed border-input text-muted-foreground',
};

export function FindingBadge({ finding }: { finding: Finding }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-sm px-200 py-100 text-200 font-medium', FINDING_TONE[finding])}>
      {FINDING_LABELS[finding]}
    </span>
  );
}

export function SecurityBadge({ state }: { state: SecurityState }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-100 whitespace-nowrap text-200',
        state === 'different' && 'font-medium text-destructive',
        state === 'unavailable' && 'text-muted-foreground italic',
        (state === 'match' || state === 'not_applicable') && 'text-muted-foreground'
      )}
    >
      <span aria-hidden="true">{state === 'different' ? '▲' : state === 'match' ? '●' : '○'}</span>
      {SECURITY_LABELS[state]}
    </span>
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

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-200 rounded-md border border-dashed border-border px-600 py-800 text-center">
      <p className="font-heading text-400 font-semibold text-foreground">{title}</p>
      {children ? <div className="max-w-[480px] text-300 text-muted-foreground">{children}</div> : null}
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
