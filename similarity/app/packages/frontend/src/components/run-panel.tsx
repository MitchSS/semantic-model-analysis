import {
  DEFAULT_RUN_PARAMETERS,
  validateRunParameters,
  type RunParameterError,
  type RunParameterField,
  type SimilarityRun,
  type SimilarityRunError,
  type SimilarityRunParameters,
} from '@rayfin-app/shared';
import { Loader2, Play, RotateCcw, Square } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Notice, SectionHeading } from '@/components/ui';
import { buttonClass, inputClass } from '@/lib/styles';
import type { RunSummary } from '@/lib/results/load';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<SimilarityRun['status'], string> = {
  NotStarted: 'Queued',
  InProgress: 'Running',
  Completed: 'Completed',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
  Deduped: 'Skipped (duplicate)',
  Unknown: 'Unknown',
};

export function RunStatusBadge({ run }: { run: SimilarityRun | null }) {
  if (!run) return null;
  const active = run.status === 'NotStarted' || run.status === 'InProgress';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-100 rounded-full px-200 py-100 text-200 font-medium',
        active && 'bg-accent text-accent-foreground',
        run.status === 'Completed' && 'bg-muted text-foreground',
        run.status === 'Failed' && 'bg-destructive/10 text-destructive',
        (run.status === 'Cancelled' || run.status === 'Deduped' || run.status === 'Unknown') && 'bg-muted text-muted-foreground'
      )}
    >
      {active ? <Loader2 aria-hidden="true" className="icon-size-100 animate-spin" /> : null}
      {STATUS_LABELS[run.status]}
    </span>
  );
}

const formatTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const duration = (run: SimilarityRun) => {
  if (!run.startTimeUtc || !run.endTimeUtc) return '—';
  const ms = new Date(run.endTimeUtc).getTime() - new Date(run.startTimeUtc).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  return minutes ? `${minutes}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`;
};

type FormState = Omit<SimilarityRunParameters, 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold'> & {
  duplicateThreshold: string;
  similarThreshold: string;
  containmentThreshold: string;
};

const toForm = (p: SimilarityRunParameters): FormState => ({
  ...p,
  duplicateThreshold: String(p.duplicateThreshold),
  similarThreshold: String(p.similarThreshold),
  containmentThreshold: String(p.containmentThreshold),
});

export function RunPanel({
  runs,
  active,
  loading,
  busy,
  error,
  lastAnalysis,
  onStart,
  onCancel,
  onRefresh,
}: {
  runs: SimilarityRun[];
  active: SimilarityRun | null;
  loading: boolean;
  busy: boolean;
  error: SimilarityRunError | null;
  lastAnalysis: RunSummary | null;
  onStart: (parameters: SimilarityRunParameters) => Promise<SimilarityRunError | null>;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(DEFAULT_RUN_PARAMETERS));
  const [fieldErrors, setFieldErrors] = useState<RunParameterError[]>([]);

  const errorFor = (field: RunParameterField) => fieldErrors.find((e) => e.field === field)?.message;
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = {
      ...form,
      duplicateThreshold: form.duplicateThreshold.trim() === '' ? Number.NaN : Number(form.duplicateThreshold),
      similarThreshold: form.similarThreshold.trim() === '' ? Number.NaN : Number(form.similarThreshold),
      containmentThreshold: form.containmentThreshold.trim() === '' ? Number.NaN : Number(form.containmentThreshold),
    };
    const validation = validateRunParameters(candidate);
    if (!validation.parameters) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors([]);
    const result = await onStart(validation.parameters);
    if (result?.code === 'invalid_parameters') setFieldErrors(result.fields);
  };

  const textField = (field: 'workspaceName' | 'modelName' | 'reportWorkspaceName', label: string, hint: string) => (
    <div className="flex flex-col gap-100 text-300">
      <label htmlFor={field} className="font-medium text-foreground">{label}</label>
      <input
        id={field}
        type="text"
        value={form[field]}
        onChange={(event) => update(field, event.target.value)}
        placeholder="All (leave blank)"
        aria-invalid={!!errorFor(field)}
        aria-describedby={`${field}-hint`}
        className={inputClass}
        maxLength={256}
      />
      <span id={`${field}-hint`} className={cn('text-200', errorFor(field) ? 'text-destructive' : 'text-muted-foreground')}>
        {errorFor(field) ?? hint}
      </span>
    </div>
  );

  const thresholdField = (field: 'duplicateThreshold' | 'similarThreshold' | 'containmentThreshold', label: string, hint: string) => (
    <div className="flex flex-col gap-100 text-300">
      <label htmlFor={field} className="font-medium text-foreground">{label}</label>
      <input
        id={field}
        type="number"
        inputMode="decimal"
        min={0.01}
        max={1}
        step={0.01}
        value={form[field]}
        onChange={(event) => update(field, event.target.value)}
        aria-invalid={!!errorFor(field)}
        aria-describedby={`${field}-hint`}
        className={cn(inputClass, 'font-numeric')}
      />
      <span id={`${field}-hint`} className={cn('text-200', errorFor(field) ? 'text-destructive' : 'text-muted-foreground')}>
        {errorFor(field) ?? hint}
      </span>
    </div>
  );

  return (
    <section aria-labelledby="runs-heading" className="flex flex-col gap-400">
      <SectionHeading
        id="runs-heading"
        title="Run analysis"
        detail="Runs notebook 001 in Fabric to collect the catalog and rescore all pairs. Results replace the current snapshot."
      />

      {error ? (
        <Notice
          tone="error"
          title={error.code === 'run_in_progress' ? 'A run is already in progress' : 'Run request failed'}
          action={
            <button type="button" className={buttonClass()} onClick={onRefresh}>
              <RotateCcw aria-hidden="true" className="icon-size-200" /> Refresh
            </button>
          }
        >
          {error.message}
        </Notice>
      ) : null}

      <div className="grid gap-400 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={submit} className="flex flex-col gap-400 rounded-md border border-border bg-card p-400" noValidate>
          <fieldset className="grid gap-300 md:grid-cols-3" disabled={busy || !!active}>
            <legend className="mb-200 font-heading text-400 font-semibold">Scope</legend>
            {textField('workspaceName', 'Workspace', 'Exact model workspace name.')}
            {textField('modelName', 'Model', 'Exact semantic model name.')}
            {textField('reportWorkspaceName', 'Report workspace', 'Independent of the model filters.')}
          </fieldset>
          <fieldset className="grid gap-300 md:grid-cols-3" disabled={busy || !!active}>
            <legend className="mb-200 font-heading text-400 font-semibold">Scoring</legend>
            {thresholdField('duplicateThreshold', 'Duplicate threshold', 'Overall score for a possible duplicate.')}
            {thresholdField('similarThreshold', 'Similar threshold', 'Overall score for shared structure.')}
            {thresholdField('containmentThreshold', 'Coverage threshold', 'Directional schema coverage.')}
            <label className="flex items-start gap-200 text-300 md:col-span-3">
              <input
                type="checkbox"
                checked={form.enableBlocking}
                onChange={(event) => update('enableBlocking', event.target.checked)}
                className="mt-100 accent-[var(--color-primary)]"
              />
              <span>
                <span className="font-medium text-foreground">Candidate blocking</span>
                <span className="block text-200 text-muted-foreground">
                  Only compare models sharing a table or measure name. Turning it off compares every pair and is slower.
                </span>
              </span>
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-300">
            {active ? (
              <button type="button" className={buttonClass('danger')} onClick={onCancel} disabled={busy}>
                <Square aria-hidden="true" className="icon-size-200" /> Cancel run
              </button>
            ) : (
              <button type="submit" className={buttonClass('primary')} disabled={busy || loading}>
                {busy ? <Loader2 aria-hidden="true" className="icon-size-200 animate-spin" /> : <Play aria-hidden="true" className="icon-size-200" />}
                Start run
              </button>
            )}
            <button type="button" className={buttonClass('ghost')} onClick={() => { setForm(toForm(DEFAULT_RUN_PARAMETERS)); setFieldErrors([]); }} disabled={busy || !!active}>
              Reset to defaults
            </button>
            <span role="status" aria-live="polite" className="text-300 text-muted-foreground">
              {active ? (
                <>
                  <RunStatusBadge run={active} /> Status refreshes every 15 seconds. You can keep reviewing results meanwhile.
                </>
              ) : null}
            </span>
          </div>
          <p className="text-200 text-muted-foreground">
            Runs execute with the Fabric app owner's permissions, so the scan covers the workspaces and models that identity can read.
            Temporary workspace access is not available from the app.
          </p>
        </form>

        <div className="flex flex-col gap-400">
          <div className="rounded-md border border-border bg-card p-400">
            <h3 className="font-heading text-400 font-semibold">Current results</h3>
            {lastAnalysis ? (
              <dl className="mt-200 grid grid-cols-2 gap-x-300 gap-y-100 text-300">
                <dt className="text-muted-foreground">Generated</dt>
                <dd className="font-numeric">{formatTime(lastAnalysis.generatedAt)}</dd>
                <dt className="text-muted-foreground">Models · pairs</dt>
                <dd className="font-numeric">{lastAnalysis.modelCount ?? '—'} · {lastAnalysis.pairCount ?? '—'}</dd>
                <dt className="text-muted-foreground">Duplicates · groups</dt>
                <dd className="font-numeric">{lastAnalysis.duplicateCount ?? '—'} · {lastAnalysis.clusterCount ?? '—'}</dd>
                <dt className="text-muted-foreground">Thresholds</dt>
                <dd className="font-numeric">
                  {lastAnalysis.duplicateThreshold ?? '—'} / {lastAnalysis.similarThreshold ?? '—'} / {lastAnalysis.containmentThreshold ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Blocking</dt>
                <dd>{lastAnalysis.enableBlocking === null ? '—' : lastAnalysis.enableBlocking ? 'On' : 'Off'}</dd>
              </dl>
            ) : (
              <p className="mt-200 text-300 text-muted-foreground">No analysis has been saved yet.</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-400">
            <h3 className="font-heading text-400 font-semibold">Recent runs</h3>
            {loading ? (
              <p className="mt-200 text-300 text-muted-foreground">Loading run history…</p>
            ) : runs.length ? (
              <table className="mt-200 w-full border-collapse text-left text-300">
                <caption className="sr-only">Recent notebook runs</caption>
                <thead className="text-200 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-100 pr-300 font-medium">Started</th>
                    <th scope="col" className="py-100 pr-300 font-medium">Status</th>
                    <th scope="col" className="py-100 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-border align-top">
                      <td className="py-100 pr-300 font-numeric">{formatTime(run.startTimeUtc)}</td>
                      <td className="py-100 pr-300">
                        <RunStatusBadge run={run} />
                        {run.failureMessage ? <p className="mt-100 break-words text-200 text-destructive">{run.failureMessage}</p> : null}
                      </td>
                      <td className="py-100 font-numeric">{duration(run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-200 text-300 text-muted-foreground">No runs yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
