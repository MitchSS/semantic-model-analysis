import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LABELS, score, validScore, type Results, type Thresholds } from '@/lib/results/logic';
import { buttonClass, inputClass } from '@/lib/styles';
import { LinkButton } from '@/components/ui';

const percent = (value: number) => Math.round(value * 10000) / 100;

export function SettingsPanel({
  thresholds,
  defaults,
  onApply,
  onHelp,
}: {
  thresholds: Thresholds;
  defaults: Thresholds;
  onApply: (next: Thresholds) => void;
  onHelp: () => void;
}) {
  const [draft, setDraft] = useState<Record<keyof Thresholds, string>>(() => ({
    duplicate: String(percent(thresholds.duplicate)),
    similar: String(percent(thresholds.similar)),
    containment: String(percent(thresholds.containment)),
  }));
  const [invalid, setInvalid] = useState(false);

  const row = (key: keyof Thresholds, label: string, hint: string) => (
    <div key={key} className="flex flex-col gap-100">
      <label htmlFor={`range-${key}`} className="flex flex-col text-300 font-medium">
        {label}
        <small className="text-200 font-normal text-muted-foreground">{hint}</small>
      </label>
      <div className="flex items-center gap-200">
        <input
          id={`range-${key}`}
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={Number(draft[key]) || 0}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          aria-label={`${label} minimum score percent`}
          className="flex-1 accent-[var(--color-primary)]"
        />
        <input
          type="number"
          min={0}
          max={100}
          step={0.01}
          required
          value={draft[key]}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          aria-label={`${label} minimum score percent value`}
          className={`${inputClass} w-[96px]`}
        />
      </div>
    </div>
  );

  const apply = () => {
    const parse = (key: keyof Thresholds) => (draft[key].trim() === '' ? NaN : Number(draft[key]) / 100);
    const values: Thresholds = { duplicate: parse('duplicate'), similar: parse('similar'), containment: parse('containment') };
    if (!(['duplicate', 'similar', 'containment'] as const).every((key) => validScore(values[key]))) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onApply(values);
  };

  return (
    <div id="scoring-settings" className="flex flex-col gap-300 rounded-md border border-border bg-card px-400 py-300">
      <div className="grid grid-cols-1 gap-400 md:grid-cols-3">
        {row('duplicate', LABELS.duplicate, 'Overall (%)')}
        {row('similar', LABELS.overlap, 'Overall (%)')}
        {row('containment', LABELS.containment, 'Directional coverage (%)')}
      </div>
      {invalid ? (
        <div role="alert" className="text-300 text-destructive">
          Enter percentages from 0 to 100.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-300">
        <LinkButton onClick={onHelp}>Calculation details</LinkButton>
        <div className="flex gap-200">
          <button
            type="button"
            className={buttonClass()}
            onClick={() => {
              setDraft({ duplicate: String(percent(defaults.duplicate)), similar: String(percent(defaults.similar)), containment: String(percent(defaults.containment)) });
              setInvalid(false);
              onApply(defaults);
            }}
          >
            Reset defaults
          </button>
          <button type="button" className={buttonClass('primary')} onClick={apply}>
            Apply thresholds
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <strong className="text-200">{label}</strong>
      <span className="text-300 text-muted-foreground">{children}</span>
    </div>
  );
}

/** Definitions & scan details — wording mirrors notebook 002 `helpHTML`. */
export function HelpDialog({ open, onClose, results }: { open: boolean; onClose: () => void; results: Results }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.scrollTop = 0;
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  const data = results.data;
  const reports = results.reports;
  const weights = data.combinedWeights;
  const weightText = weights ? `${score(weights.schema)} schema + ${score(weights.security)} security` : 'Weights unavailable';
  const h3 = 'mt-300 font-heading text-400 font-semibold';
  const p = 'text-300 text-muted-foreground';

  return (
    <dialog
      ref={ref}
      aria-labelledby="help-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="max-h-[80vh] w-[min(620px,calc(100vw-24px))] overflow-auto rounded-md border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
    >
      {open ? (
        <div className="flex flex-col gap-200 px-500 py-400">
          <div className="flex items-center justify-between gap-300">
            <h2 id="help-title" className="font-heading text-500 font-semibold">
              Definitions &amp; scan details
            </h2>
            <button type="button" className={buttonClass('ghost')} onClick={onClose} aria-label="Close definitions" title="Close" autoFocus>
              <X aria-hidden="true" className="icon-size-200" />
            </button>
          </div>
          <h3 className={h3}>Current evidence</h3>
          <div className="grid grid-cols-1 gap-200 sm:grid-cols-2">
            <Fact label="View generated">{data.generatedAt || 'Unknown'}</Fact>
            <Fact label="Report snapshot">{reports.scannedAt || 'Unknown'}</Fact>
            <Fact label="Report scope">{results.reportScopeText()}</Fact>
            <Fact label="Report scan">{results.shortReportStatus()}</Fact>
            <Fact label="Overall weights">{weightText}</Fact>
          </div>
          {data.securityNotice ? (
            <p role="status" className={p}>
              {data.securityNotice}
            </p>
          ) : null}
          <h3 className={h3}>Scores</h3>
          <p className={p}>
            <strong>Overall</strong> drives possible-duplicate labels and groups. Security differences remain warnings, not a veto. Threshold controls reclassify saved scores; they do not rescan or recalculate them.
          </p>
          <p className={p}>
            <strong>Schema</strong> blends five overlap signals and local TF-IDF text similarity for DAX and Power Query (M). Overlap is shared unique definitions divided by all unique definitions. Text similarity is resemblance, not a count of matching formulas. Models without measures use structural or model text. Power Query is skipped when neither model has M and scores 0 when only one does. Sources are legacy connections plus the upstream sources M connector calls reference.
          </p>
          <p className={p}>
            <strong>Security</strong> compares role rules, not security strength. Roles align one-to-one independently of their names. Exact RLS filter text, table/column permissions, and applicable propagation settings are compared. Members and effective access are not assessed.
          </p>
          <p className={p}>
            <strong>Coverage</strong> is directional: A within B and B within A are separate weighted schema measures, not percentages of objects or data values. Security is excluded.
          </p>
          <h3 className={h3}>Missing values</h3>
          <p className={p}>
            <strong>Not scored</strong> means no saved pair score, often because blocking excluded the pair. <strong>Unavailable</strong> means a score cannot be assessed from the current evidence. Neither means 0%. A complete scan with no roles is <strong>Not applicable</strong> for security; overall then equals schema.
          </p>
          <h3 className={h3}>Comparison scope</h3>
          <p className={p}>
            <strong>Cross-workspace only</strong> includes pairs with known, different workspace IDs. Candidate and group totals follow this scope, while catalog model totals remain unchanged. Groups are rebuilt from qualifying links in scope, and their highest pair score uses those same links. Same-workspace members may still connect through another workspace.
          </p>
          <p className={p}>
            Map cells marked <strong>Outside scope</strong> are excluded comparisons, not missing or zero scores. Models with unknown workspace IDs are excluded from cross-workspace comparisons. Manual Compare can inspect any explicitly selected pair without changing the scope.
          </p>
          <h3 className={h3}>Review limits</h3>
          <p className={p}>
            Possible duplicates are candidates, not verified replacements. Scores do not establish equal data, calculation results, effective permissions or retirement safety. Groups are connected by qualifying pairs; not every pair in a group qualifies.
          </p>
          <p className={p}>
            Linked reports are observed direct dependencies in the scanned scope, not usage. Partial scans show known links only. Zero reports does not prove a model is unused.
          </p>
          {reports.scans?.length ? (
            <>
              <h3 className={h3}>Report workspace scans</h3>
              <div className="flex flex-col divide-y divide-border text-300">
                {reports.scans.map((scan, index) => (
                  <div key={index} className="grid grid-cols-3 gap-200 py-100">
                    <span>{scan.workspace}</span>
                    <span className="text-muted-foreground">
                      {scan.status}
                      {scan.errorType ? ` / ${scan.errorType}` : ''}
                    </span>
                    <span className="text-muted-foreground">{scan.reportCount} reports</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
