import { useState } from 'react';

import { Field, Notice, ScoreCell, Tag } from '@/components/ui';
import { rebindStateFor, trustedModelFor, type ActionsState } from '@/hooks/use-actions';
import { GUID, coverageWithin, modelSettingsUrl, rebindScript } from '@/lib/actions';
import { score, type Results, type ViewState } from '@/lib/results/logic';
import type { ReportEntry } from '@/lib/results/payload';
import { buttonClass, inputClass } from '@/lib/styles';

type Group = ReturnType<Results['buildGroups']>[number];

const when = (value: Date | string) => new Date(value).toLocaleString();

function ReportRebindRow({
  results,
  state,
  actions,
  report,
  fromId,
  trusted,
}: {
  results: Results;
  state: ViewState;
  actions: ActionsState;
  report: ReportEntry;
  fromId: string;
  trusted: { modelId: string; modelName: string };
}) {
  const [override, setOverride] = useState(false);
  const [script, setScript] = useState(false);
  const from = results.model(fromId);
  const coverage = coverageWithin(results, fromId, trusted.modelId);
  const meetsCoverage = coverage !== null && coverage >= state.thresholds.containment;
  const { plan, state: status, outcome } = rebindStateFor(actions.log, report.id, actions.approvers);
  const current = plan && plan.toModelId === trusted.modelId ? status : 'none';
  const rebindable = report.reportType === 'PowerBIReport' && [report.id, report.workspaceId, fromId, trusted.modelId].every((id) => GUID.test(id));
  const disabled = actions.busy || !actions.email;

  const planIt = () =>
    actions.planRebind({
      reportId: report.id,
      reportName: report.name,
      reportWorkspaceId: report.workspaceId,
      reportWorkspaceName: report.workspace,
      fromModelId: fromId,
      fromModelName: from.name,
      toModelId: trusted.modelId,
      toModelName: trusted.modelName,
      coverage: coverage ?? undefined,
      coverageOverride: !meetsCoverage && override,
    });

  const label: Record<string, string> = {
    none: 'Not planned',
    proposed: 'Proposed, awaiting approver',
    planned: 'Approved plan, not run',
    executed: 'Rebound (shows in report data after the next analysis run)',
    failed: 'Last attempt failed',
    undone: 'Undone',
  };

  return (
    <li className="flex flex-col gap-200 py-200">
      <div className="flex flex-wrap items-center justify-between gap-300">
        <div>
          <div className="font-medium">{report.name}</div>
          <div className="text-200 text-muted-foreground">
            Workspace: {report.workspace} · now uses {from.name}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-300 text-200">
          <span className="flex items-center gap-100">
            Coverage in trusted model <ScoreCell value={coverage} unavailable="Not scored" />
          </span>
          <Tag warning={current === 'failed'}>{label[current]}</Tag>
        </div>
      </div>
      {outcome?.message && (current === 'failed' || current === 'executed') ? <div className="text-200 text-muted-foreground">{outcome.message}</div> : null}
      {!rebindable ? (
        <div className="text-200 text-muted-foreground">Only Power BI reports can be rebound; paginated and other report types are not supported.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-200">
          {current === 'none' || current === 'failed' || current === 'undone' ? (
            <>
              {!meetsCoverage ? (
                <label className="flex items-center gap-100 text-200 text-muted-foreground">
                  <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} className="accent-[var(--color-primary)]" />
                  Coverage is below {score(state.thresholds.containment)}: plan anyway
                </label>
              ) : null}
              <button type="button" className={buttonClass()} disabled={disabled || (!meetsCoverage && !override)} onClick={() => void planIt()}>
                {actions.isApprover ? 'Approve rebind plan' : 'Propose rebind'}
              </button>
            </>
          ) : null}
          {current === 'proposed' && actions.isApprover ? (
            <button type="button" className={buttonClass()} disabled={disabled} onClick={() => void planIt()}>
              Approve proposed rebind
            </button>
          ) : null}
          {current === 'planned' && plan && actions.isApprover ? (
            <button type="button" className={buttonClass('primary')} disabled={disabled} onClick={() => void actions.perform(plan, 'execute')}>
              Rebind now
            </button>
          ) : null}
          {current === 'executed' && plan && actions.isApprover ? (
            <button type="button" className={buttonClass('danger')} disabled={disabled} onClick={() => void actions.perform(plan, 'undo')}>
              Undo rebind
            </button>
          ) : null}
          {plan && (current === 'planned' || current === 'executed') ? (
            <button type="button" className={buttonClass('ghost')} aria-expanded={script} onClick={() => setScript((open) => !open)}>
              {script ? 'Hide script' : 'Run it yourself'}
            </button>
          ) : null}
        </div>
      )}
      {script && plan ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-secondary px-300 py-200 font-mono text-200">{rebindScript(plan)}</pre>
      ) : null}
    </li>
  );
}

/** Next actions for a duplicate group: choose a trusted model, endorse it, and rebind reports to it. */
export function GroupActions({ results, state, group, actions }: { results: Results; state: ViewState; group: Group; actions: ActionsState }) {
  const { approved, proposals } = trustedModelFor(actions.decisions, group.members, actions.approvers);
  const [choice, setChoice] = useState(approved?.modelId ?? group.strongest.idA);
  const [rationale, setRationale] = useState('');
  const disabled = actions.busy || !actions.email;
  const trusted = approved ? results.model(approved.modelId) : null;

  const decide = (modelId: string) => {
    const model = results.model(modelId);
    void actions.decide({
      groupKey: results.groupKey(group),
      modelId,
      modelName: model.name,
      workspaceId: model.workspaceId,
      workspaceName: model.workspace,
      rationale: rationale.trim() || undefined,
    });
    setRationale('');
  };

  return (
    <section aria-labelledby="group-actions-title" className="flex flex-col gap-300 border-t border-border pt-300">
      <h4 id="group-actions-title" className="font-heading text-400 font-semibold">
        Next actions
      </h4>
      {actions.error ? <Notice tone="error" title={actions.error} /> : null}
      {actions.loading && !actions.decisions.length ? <div className="text-300 text-muted-foreground">Loading next actions…</div> : null}

      <div className="flex flex-col gap-200">
        <h5 className="text-300 font-semibold">1. Trusted model</h5>
        {approved && trusted ? (
          <p className="text-300">
            <strong>{approved.modelName}</strong> ({approved.workspaceName}) — approved by {approved.authorEmail}, {when(approved.createdAt)}
            {approved.rationale ? <span className="text-muted-foreground">. {approved.rationale}</span> : null}
          </p>
        ) : (
          <p className="text-300 text-muted-foreground">No trusted model approved for this group yet.</p>
        )}
        {proposals.map((proposal) => (
          <div key={proposal.id} className="flex flex-wrap items-center gap-200 text-300">
            <Tag>Proposed</Tag>
            {proposal.modelName} by {proposal.authorEmail}, {when(proposal.createdAt)}
            {proposal.rationale ? <span className="text-muted-foreground">— {proposal.rationale}</span> : null}
            {actions.isApprover ? (
              <button type="button" className={buttonClass('ghost')} disabled={disabled} onClick={() => decide(proposal.modelId)}>
                Approve
              </button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-300">
          <Field label="Model">
            <select value={choice} onChange={(event) => setChoice(event.target.value)} className={inputClass}>
              {group.members.map((id) => (
                <option key={id} value={id}>
                  {results.selectionLabel(id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason (optional)">
            <input value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} className={inputClass} placeholder="Why this model" />
          </Field>
          <button type="button" className={buttonClass(actions.isApprover ? 'primary' : 'secondary')} disabled={disabled} onClick={() => decide(choice)}>
            {actions.isApprover ? 'Approve as trusted model' : 'Propose as trusted model'}
          </button>
        </div>
        {!actions.isApprover && actions.email ? (
          <p className="text-200 text-muted-foreground">Your proposals are recorded for an approver. Approvers: {[...actions.approvers].join(', ') || 'none configured'}.</p>
        ) : null}
      </div>

      {approved && trusted ? (
        <>
          <div className="flex flex-col gap-200">
            <h5 className="text-300 font-semibold">2. Promote or certify</h5>
            <p className="text-300 text-muted-foreground">
              Power BI has no public API to endorse a model, so this step is manual. Open the model's settings and, under <strong>Endorsement and discovery</strong>, choose{' '}
              <strong>Promoted</strong>, or <strong>Certified</strong> if you're an authorized certifier. Make it discoverable so report authors can find it.
            </p>
            {GUID.test(approved.workspaceId) && GUID.test(approved.modelId) ? (
              <a className={buttonClass()} href={modelSettingsUrl(approved.workspaceId, approved.modelId)} target="_blank" rel="noopener noreferrer">
                Open {approved.modelName} settings
              </a>
            ) : null}
          </div>
          <div className="flex flex-col gap-200">
            <h5 className="text-300 font-semibold">3. Rebind reports to {approved.modelName}</h5>
            {!results.reportsAvailable() ? (
              <p className="text-300 text-muted-foreground">Report dependencies are unknown. Run the analysis with a report scan first.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {group.members
                  .filter((id) => id !== approved.modelId)
                  .flatMap((id) => results.reportsFor(id).map((report) => ({ id, report })))
                  .map(({ id, report }) => (
                    <ReportRebindRow
                      key={`${report.workspaceId}|${report.id}`}
                      results={results}
                      state={state}
                      actions={actions}
                      report={report}
                      fromId={id}
                      trusted={{ modelId: approved.modelId, modelName: approved.modelName }}
                    />
                  ))}
              </ul>
            )}
            {results.reportsAvailable() && !group.members.some((id) => id !== approved.modelId && results.reportsFor(id).length) ? (
              <p className="text-300 text-muted-foreground">No linked reports found on the other models in this group.</p>
            ) : null}
            <p className="text-200 text-muted-foreground">
              <strong>Rebind now</strong> runs as the app owner through the Power BI API, only for plans approved by an approver, and only if the report still uses the planned model. Use{' '}
              <strong>Run it yourself</strong> to run the same change under your own account instead.
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Actions tab: who you are in the approval flow, and the audit log of decisions and rebinds. */
export function ActionsView({ actions }: { actions: ActionsState }) {
  const rows = [
    ...actions.decisions.map((row) => ({
      id: row.id,
      at: new Date(row.createdAt),
      what: actions.approvers.has(row.authorEmail.toLowerCase()) ? 'Approved trusted model' : 'Proposed trusted model',
      detail: `${row.modelName} (${row.workspaceName})${row.rationale ? ` — ${row.rationale}` : ''}`,
      who: row.authorEmail,
    })),
    ...actions.log.map((row) => ({
      id: row.id,
      at: new Date(row.createdAt),
      what:
        row.kind === 'planned'
          ? actions.approvers.has(row.authorEmail.toLowerCase())
            ? 'Approved rebind plan'
            : 'Proposed rebind'
          : { executed: 'Rebound', failed: 'Rebind failed', undone: 'Rebind undone', undo_failed: 'Undo failed' }[row.kind],
      detail: `${row.reportName}: ${row.fromModelName} → ${row.toModelName}${row.coverageOverride ? ' (coverage override)' : ''}${row.message ? ` — ${row.message}` : ''}`,
      who: row.authorEmail,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <section aria-labelledby="actions-heading" className="flex flex-col gap-400">
      <div className="flex flex-wrap items-end justify-between gap-300">
        <h2 id="actions-heading" className="font-heading text-500 font-semibold tracking-tight">
          Next actions
        </h2>
        <button type="button" className={buttonClass()} onClick={() => void actions.refresh()} disabled={actions.loading}>
          Refresh
        </button>
      </div>
      {actions.error ? <Notice tone="error" title={actions.error} /> : null}
      <p className="text-300 text-muted-foreground">
        Choose trusted models and rebind reports from a group in <strong>Groups</strong>. Signed in as {actions.email ?? 'unknown'} —{' '}
        {actions.isApprover ? 'you can approve and run actions.' : 'you can propose actions for an approver.'} Approvers: {[...actions.approvers].join(', ') || 'none configured'}.
      </p>
      {rows.length ? (
        <div className="overflow-auto rounded-md border border-border bg-card" role="region" aria-label="Action history" tabIndex={0}>
          <table className="w-full min-w-[720px] border-collapse text-left text-300">
            <thead className="border-b border-border bg-secondary text-200 text-muted-foreground">
              <tr>
                {['When', 'Action', 'Details', 'By'].map((label) => (
                  <th key={label} scope="col" className="px-300 py-200 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-300 py-200 text-muted-foreground">{row.at.toLocaleString()}</td>
                  <td className="px-300 py-200 font-medium">{row.what}</td>
                  <td className="px-300 py-200">{row.detail}</td>
                  <td className="px-300 py-200 text-muted-foreground">{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">
          {actions.loading ? 'Loading…' : 'No actions recorded yet.'}
        </div>
      )}
    </section>
  );
}
