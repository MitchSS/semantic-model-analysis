import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, ScoreBar, SecurityBadge, SectionHeading } from '@/components/ui';
import { buttonClass } from '@/lib/styles';
import { formatPercent, type ClusterView, type PairView } from '@/lib/similarity-model';
import { cn } from '@/lib/utils';

export function GroupsView({
  clusters,
  onCompare,
}: {
  clusters: ClusterView[];
  onCompare: (pair: PairView) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(clusters[0]?.id ?? null);
  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? clusters[0] ?? null;

  if (!clusters.length) {
    return (
      <section className="flex flex-col gap-400">
        <SectionHeading title="Duplicate groups" />
        <EmptyState title="No duplicate groups in scope">
          Groups connect possible-duplicate pairs. None qualify in the current scope — that is a valid result.
        </EmptyState>
      </section>
    );
  }

  return (
    <section aria-labelledby="groups-heading" className="flex flex-col gap-400">
      <SectionHeading
        id="groups-heading"
        title="Duplicate groups"
        detail="Connected possible-duplicate pairs. Members may link through each other — a group is not an all-to-all claim."
      />
      <div className="grid gap-400 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="flex flex-col gap-200" aria-label="Groups">
          {clusters.map((cluster) => (
            <li key={cluster.id}>
              <button
                type="button"
                onClick={() => setSelectedId(cluster.id)}
                aria-pressed={selected?.id === cluster.id}
                className={cn(
                  'flex w-full items-center justify-between gap-300 rounded-md border bg-card px-400 py-300 text-left transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected?.id === cluster.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {cluster.members.map((m) => m.name).join(', ')}
                  </span>
                  <span className="text-200 text-muted-foreground">
                    {cluster.members.length} models · {cluster.workspaceCount} workspace{cluster.workspaceCount === 1 ? '' : 's'}
                    {cluster.securityDiffers ? ' · security differs' : ''}
                  </span>
                </span>
                <span className="font-numeric text-400 font-semibold tabular-nums text-primary">
                  {formatPercent(cluster.bestPair?.combined)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <div className="flex flex-col gap-300 rounded-md border border-border bg-card p-400">
            <h3 className="font-heading text-400 font-semibold">Group {selected.id}</h3>
            <ul className="flex flex-wrap gap-200">
              {selected.members.map((member) => (
                <li key={member.id} className="rounded-sm bg-muted px-200 py-100 text-200">
                  <span className="font-medium text-foreground">{member.name}</span>
                  <span className="text-muted-foreground"> · {member.workspace}</span>
                </li>
              ))}
            </ul>
            <div className="overflow-auto">
              <table className="w-full border-collapse text-left text-300">
                <caption className="sr-only">Pairs within group {selected.id}</caption>
                <thead className="text-200 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-200 pr-300 font-medium">Pair</th>
                    <th scope="col" className="py-200 pr-300 font-medium">Overall</th>
                    <th scope="col" className="py-200 pr-300 font-medium">Security</th>
                    <th scope="col" className="py-200"><span className="sr-only">Compare</span></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.pairs.map((pair) => (
                    <tr key={pair.key} className="border-t border-border">
                      <td className="py-200 pr-300">
                        {pair.a.name} <span className="text-muted-foreground">↔</span> {pair.b.name}
                      </td>
                      <td className="py-200 pr-300"><ScoreBar value={pair.combined} label="Overall" emphasis /></td>
                      <td className="py-200 pr-300"><SecurityBadge state={pair.securityState} /></td>
                      <td className="py-200 text-right">
                        <button type="button" className={buttonClass('ghost')} onClick={() => onCompare(pair)} aria-label={`Compare ${pair.a.name} and ${pair.b.name}`}>
                          <ArrowRight aria-hidden="true" className="icon-size-200" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
