import type { ReactNode } from 'react';

import { StatusStrip, type ViewProps } from '@/components/review-view';
import { Field, LinkButton, ScoreCell, Tag } from '@/components/ui';
import type { Results } from '@/lib/results/logic';
import { buttonClass, inputClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

type Group = ReturnType<Results['buildGroups']>[number];
export type GroupSelections = Record<string, { a: string; b: string }>;

function GroupSecurity({ group }: { group: Group }) {
  const labels: ReactNode[] = [];
  if (group.securityDifferent) labels.push(<Tag key="different" warning>Security differs</Tag>);
  if (group.securityUnknown) labels.push(<Tag key="unknown" warning>Not assessed</Tag>);
  return <span className="flex flex-wrap gap-100">{labels.length ? labels : <Tag>Matching definitions</Tag>}</span>;
}

export function GroupsView({
  results,
  state,
  update,
  onHelp,
  onCompare,
  selectedGroup,
  onSelectGroup,
  selections,
  onSelectionChange,
  actions,
}: ViewProps & {
  selectedGroup: string;
  onSelectGroup: (key: string) => void;
  selections: GroupSelections;
  onSelectionChange: (key: string, chosen: { a: string; b: string }) => void;
  /** Optional app-only slot (next actions) rendered in the group detail. */
  actions?: (group: Group) => ReactNode;
}) {
  const { all, groups, empty } = results.groupResults(state);
  const selected = groups.find((entry) => entry.key === selectedGroup) ?? groups[0];

  let detail: ReactNode = null;
  if (selected) {
    const { chosen, options } = results.groupSelection(state, selected.group, selections[selected.key]);
    const optionList = (ids: string[]) =>
      ids.map((id) => (
        <option key={id} value={id}>
          {results.selectionLabel(id)}
        </option>
      ));
    detail = (
      <section id="group-detail" aria-labelledby="group-detail-title" className="flex flex-col gap-300 rounded-md border border-border bg-card px-400 py-300">
        <div className="flex flex-wrap items-center justify-between gap-200">
          <h3 id="group-detail-title" className="font-heading text-400 font-semibold">
            {selected.label} / {selected.group.members.length} models
          </h3>
          <GroupSecurity group={selected.group} />
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {selected.group.members.map((id) => {
            const entry = results.model(id);
            const security = results.modelSecurityText(id).replace('No model-level security roles', 'No model roles').replace('Security not assessed', 'Not assessed');
            return (
              <li key={id} className="grid grid-cols-1 gap-100 py-200 text-300 sm:grid-cols-[2fr_2fr_1fr_1fr] sm:gap-300">
                <span className="font-medium text-foreground">{entry.name}</span>
                <span className="text-muted-foreground">{entry.workspace}</span>
                <span className="text-muted-foreground">{security}</span>
                <span className="text-muted-foreground">{results.shortReportCount(id)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-end gap-300">
          <Field label="Model A">
            <select
              value={chosen.a}
              onChange={(event) => onSelectionChange(selected.key, { ...chosen, a: event.target.value })}
              className={inputClass}
            >
              {optionList(selected.group.members)}
            </select>
          </Field>
          <Field label="Model B">
            <select
              value={chosen.b}
              onChange={(event) => onSelectionChange(selected.key, { ...chosen, b: event.target.value })}
              className={inputClass}
            >
              {optionList(options)}
            </select>
          </Field>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={!chosen.b}
            onClick={() => {
              if (chosen.b && chosen.a !== chosen.b && results.inComparisonScope(state, chosen.a, chosen.b)) {
                onCompare(chosen.a, chosen.b, results.relevantSection(results.pair(chosen.a, chosen.b)));
              }
            }}
          >
            Compare
          </button>
        </div>
        {actions ? actions(selected.group) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="groups-heading" className="flex flex-col gap-400">
      <h2 id="groups-heading" className="font-heading text-500 font-semibold tracking-tight">
        Possible duplicate groups
      </h2>
      <StatusStrip results={results} state={state} onHelp={onHelp} />
      <div className="flex flex-wrap items-end gap-300">
        <Field label="Search">
          <input
            type="text"
            value={state.groupSearch}
            onChange={(event) => update({ groupSearch: event.target.value })}
            aria-label="Search groups"
            placeholder="Models or workspaces"
            className={cn(inputClass, 'min-w-[220px]')}
          />
        </Field>
      </div>
      {!groups.length ? (
        <div className="rounded-md border border-dashed border-border px-600 py-800 text-center text-300 text-muted-foreground">{empty}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-300 text-300 text-muted-foreground">
            <span role="status">
              {groups.length} of {all.length} groups
            </span>
            <LinkButton onClick={onHelp}>Group definitions</LinkButton>
          </div>
          <div className="overflow-auto rounded-md border border-border bg-card" role="region" aria-label="Possible duplicate groups" tabIndex={0}>
            <table className="w-full min-w-[640px] border-collapse text-left text-300">
              <thead className="border-b border-border bg-secondary text-200 text-muted-foreground">
                <tr>
                  {['Group', 'Models', 'Workspaces', 'Highest pair score', 'Security'].map((label) => (
                    <th key={label} scope="col" className="px-300 py-200 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((entry) => {
                  const active = entry.key === selected?.key;
                  return (
                    <tr key={entry.key} className={cn('border-b border-border last:border-0', active && 'bg-accent')}>
                      <td className="px-300 py-200">
                        <button
                          type="button"
                          onClick={() => onSelectGroup(entry.key)}
                          aria-expanded={active}
                          aria-controls="group-detail"
                          className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {entry.label}
                        </button>
                      </td>
                      <td className="px-300 py-200 font-numeric tabular-nums">{entry.group.members.length}</td>
                      <td className="px-300 py-200 font-numeric tabular-nums">{new Set(entry.group.members.map((id) => results.workspaceKey(id))).size}</td>
                      <td className="px-300 py-200"><ScoreCell value={entry.group.strongest.combined} emphasis /></td>
                      <td className="px-300 py-200"><GroupSecurity group={entry.group} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {detail}
        </>
      )}
    </section>
  );
}
