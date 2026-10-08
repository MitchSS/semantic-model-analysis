import { VegaVisual, useCssTheme, type VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable, InteractionEvent } from '@microsoft/fabric-visuals-core';
import { useMemo, useState } from 'react';

import { EmptyState, SectionHeading } from '@/components/ui';
import { buttonClass } from '@/lib/styles';
import {
  buildMapCells,
  modelLabel,
  selectMapModels,
  type PairView,
  type SimilarityDataset,
} from '@/lib/similarity-model';

const MAP_SLICE = 40;

const STATE_LABELS = { scored: 'Scored', unscored: 'Not scored', unavailable: 'Unavailable', self: 'Same model' } as const;

function buildMapSpec(order: string[]): VisualizationSpec {
  return {
    encoding: {
      x: { field: 'column', type: 'nominal', sort: order, title: null, axis: { labelAngle: -50, labelLimit: 140 } },
      y: { field: 'row', type: 'nominal', sort: order, title: null, axis: { labelLimit: 180 } },
      tooltip: [
        { field: 'row', type: 'nominal', title: 'Model' },
        { field: 'column', type: 'nominal', title: 'Compared with' },
        { field: 'stateLabel', type: 'nominal', title: 'State' },
        { field: 'overall', type: 'quantitative', format: '.0%', title: 'Overall' },
      ],
    },
    layer: [
      {
        mark: { type: 'rect', stroke: 'transparent', strokeWidth: 1 },
        encoding: {
          color: {
            condition: { test: "datum.state !== 'scored'", value: 'transparent' },
            field: 'overall',
            type: 'quantitative',
            scale: { domain: [0, 1], scheme: 'tealblues' },
            legend: { title: 'Overall', format: '.0%' },
          },
        },
      },
      {
        mark: { type: 'text', fontSize: 9 },
        encoding: {
          text: { field: 'cellText', type: 'nominal' },
          color: { condition: { test: 'datum.overall >= 0.6', value: '#ffffff' }, value: '#5a6360' },
        },
      },
    ],
  };
}

export function MapView({
  dataset,
  pairs,
  onCompare,
}: {
  dataset: SimilarityDataset;
  pairs: PairView[];
  onCompare: (pair: PairView | null, aId: string, bId: string) => void;
}) {
  const theme = useCssTheme();
  const [offset, setOffset] = useState(0);
  const models = useMemo(() => selectMapModels({ models: dataset.models, pairs }, MAP_SLICE, offset), [dataset.models, pairs, offset]);

  const { data, order, byKey } = useMemo(() => {
    const labels = new Map<string, string>();
    for (const model of models) {
      let label = modelLabel(model);
      while ([...labels.values()].includes(label)) label = `${label} ′`;
      labels.set(model.id, label);
    }
    const cells = buildMapCells(models, pairs);
    const lookup = new Map<string, { pair: PairView | null; a: string; b: string }>();
    const rows = cells.map((cell) => {
      const key = `${cell.row.id}|${cell.column.id}`;
      lookup.set(key, { pair: cell.pair, a: cell.row.id, b: cell.column.id });
      const cellText =
        cell.state === 'scored' ? `${Math.round((cell.value ?? 0) * 100)}` : cell.state === 'unscored' ? '·' : cell.state === 'unavailable' ? '?' : '';
      return [labels.get(cell.row.id), labels.get(cell.column.id), cell.value, cell.state, STATE_LABELS[cell.state], cellText, key];
    });
    const table: DataTable = {
      columns: [
        { name: 'row', displayName: 'Model' },
        { name: 'column', displayName: 'Compared with' },
        { name: 'overall', displayName: 'Overall', format: '0%' },
        { name: 'state', displayName: 'State code' },
        { name: 'stateLabel', displayName: 'State' },
        { name: 'cellText', displayName: 'Label' },
        { name: 'cellKey', displayName: 'Cell' },
      ],
      rows,
    };
    return { data: table, order: models.map((m) => labels.get(m.id) ?? ''), byKey: lookup };
  }, [models, pairs]);

  const spec = useMemo(() => buildMapSpec(order), [order]);

  const handleInteraction = (events: InteractionEvent[]) => {
    for (const event of events) {
      if (event.action !== 'select') continue;
      const predicate = event.selections[0]?.predicates.find((p) => p.name === 'cellKey' && p.type === 'set');
      const key = predicate && predicate.type === 'set' ? String(predicate.values[0]) : null;
      const target = key ? byKey.get(key) : undefined;
      if (target && target.a !== target.b) onCompare(target.pair, target.a, target.b);
    }
  };

  if (!dataset.models.length) {
    return <EmptyState title="No catalog models yet">Run the analysis to populate the map.</EmptyState>;
  }

  const total = dataset.models.length;
  return (
    <section aria-labelledby="map-heading" className="flex flex-col gap-400">
      <SectionHeading
        id="map-heading"
        title="Similarity map"
        detail={`Overall score for models ${offset + 1}–${Math.min(total, offset + MAP_SLICE)} of ${total}, strongest matches first. · = not scored (often excluded by blocking), ? = unavailable. Select a cell to compare.`}
      >
        {total > MAP_SLICE ? (
          <span className="flex gap-200">
            <button type="button" className={buttonClass()} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - MAP_SLICE))}>
              Previous models
            </button>
            <button type="button" className={buttonClass()} disabled={offset + MAP_SLICE >= total} onClick={() => setOffset(offset + MAP_SLICE)}>
              Next models
            </button>
          </span>
        ) : null}
      </SectionHeading>
      <div className="overflow-auto rounded-md border border-border bg-card p-300">
        <div style={{ height: `calc(${Math.max(models.length, 6)} * var(--spacing-600) + 12rem)`, minWidth: `calc(${Math.max(models.length, 6)} * var(--spacing-600) + 14rem)` }}>
          <VegaVisual spec={spec} data={data} theme={theme} style={{ height: '100%' }} onInteraction={handleInteraction} />
        </div>
      </div>
    </section>
  );
}
