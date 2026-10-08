/**
 * Parity snapshot: a normalized summary of everything the results views derive from a payload.
 * `.github/scripts/similarity_parity_002.mjs` builds the same structure from notebook 002's
 * renderer; both must equal `.github/scripts/similarity_parity_expected.json`.
 */
import { Results, initialViewState, pairKey, score, validScore, type ViewState } from './logic';
import type { ResultsPayload } from './payload';

const ADJUSTED = { duplicate: 0.85, similar: 0.6, containment: 0.9 };

const metric = (value: number | null | undefined, unavailable: string) => (validScore(value) ? score(value) : unavailable);

export function paritySnapshot(data: ResultsPayload) {
  const r = new Results(data);
  const base = initialViewState(data);
  const keys = (rows: { pair: { idA: string; idB: string } }[]) => rows.map((row) => pairKey(row.pair.idA, row.pair.idB));
  const view = (overrides: Partial<ViewState>) => ({ ...base, ...overrides });

  const scope = (state: ViewState) => {
    const candidates = r.candidates(state);
    const counts = { duplicate: 0, containment: 0, overlap: 0 };
    candidates.forEach((item) => counts[item.category.kind]++);
    return {
      candidates: candidates.map((item) => [pairKey(item.pair.idA, item.pair.idB), item.category.kind, Math.round(item.category.primary * 1e4) / 1e4]),
      counts,
      groups: r.buildGroups(state).map((group) => ({
        members: group.members,
        strongest: pairKey(group.strongest.idA, group.strongest.idB),
        securityDifferent: group.securityDifferent,
        securityUnknown: group.securityUnknown,
      })),
    };
  };

  const workspaceOptions = r.workspaceOptions();
  const firstWorkspace = workspaceOptions[0]?.[0] ?? 'all';
  const review = (overrides: Partial<ViewState>) => keys(r.reviewSelection(view(overrides)).rows);

  const pairs = [...data.allPairs]
    .sort((a, b) => pairKey(a.idA, a.idB).localeCompare(pairKey(b.idA, b.idB)))
    .map((pair) => {
      const category = r.classify(base, pair);
      return {
        key: pairKey(pair.idA, pair.idB),
        tier: r.tierAt(base, pair.combined),
        kind: category?.kind ?? null,
        relationshipText: r.relationshipText(base, pair, category),
        relationshipSummary: r.relationshipSummary(base, pair),
        containmentSummary: r.containmentSummary(base, pair),
        relevantSection: r.relevantSection(pair),
        securityTag: r.securityTag(pair).label,
        securityLabel: r.securityLabel(pair),
        blendText: r.blendText(pair),
        labels: [r.pairModelLabel(pair.idA, pair.idB), r.pairModelLabel(pair.idB, pair.idA)],
        signals: r.schemaSignals(pair).map((signal) => [signal.label, metric(signal.value, signal.unavailable)]),
      };
    });

  const comparePairs: [string, string][] = data.allPairs.map((pair) => [pair.idA, pair.idB]);
  const ids = r.modelList.map((entry) => entry.id);
  const unscored = ids.flatMap((a, i) => ids.slice(i + 1).map((b): [string, string] => [a, b])).find(([a, b]) => !r.pair(a, b));
  if (unscored) comparePairs.push(unscored);
  const compare = comparePairs.map(([a, b]) => {
    const diff = r.compareData({ cmpDiffOnly: false }, r.model(a), r.model(b));
    return {
      key: `${a}>${b}`,
      shared: diff.shared,
      differences: diff.differences,
      sections: Object.fromEntries(
        Object.entries(diff.sections).map(([id, section]) => [
          id,
          { shared: section!.shared, diff: section!.diff, rows: section!.rows.map((row) => [row.status, row.text]) },
        ])
      ),
    };
  });

  const map = (overrides: Partial<ViewState>) => {
    const state = view({ mapSize: 4, ...overrides });
    const selection = r.mapSelection(state);
    return {
      models: selection.models.map((entry) => entry.id),
      pages: selection.pages,
      cells: selection.visible.map((row) => selection.visible.map((column) => {
        const cell = r.mapCell(state, row.id, column.id);
        return [cell.style, cell.text];
      })),
    };
  };

  const groupsUI = r.groupResults(view({ groupSearch: '' }));
  const firstGroup = groupsUI.groups[0];

  return {
    scopes: { all: scope(view({})), cross: scope(view({ crossOnly: true })), adjusted: scope(view({ thresholds: ADJUSTED })) },
    workspaceOptions,
    review: {
      default: review({}),
      sortSchemaAsc: review({ sort: 'schema', sortDirection: 'asc' }),
      sortCombinedDesc: review({ sort: 'combined', sortDirection: 'desc' }),
      filterDuplicate: review({ filter: 'duplicate' }),
      filterContainment: review({ filter: 'containment' }),
      workspace: review({ workspace: firstWorkspace }),
      securityDifferent: review({ security: 'different' }),
      powerQueryDiffers: review({ powerQuery: 'differs' }),
      powerQueryMatches: review({ powerQuery: 'matches' }),
      powerQueryNotApplicable: review({ powerQuery: 'not_applicable' }),
      searchSales: review({ search: 'sales' }),
      counts: r.reviewSelection(base).counts,
      emptyText: r.reviewEmptyText(view({ search: 'zzz-no-match' }), r.reviewSelection(view({ search: 'zzz-no-match' }))),
    },
    pairs,
    compare,
    map: { all: map({}), page2: map({ mapPage: 2 }), cross: map({ crossOnly: true }), search: map({ mapSearch: 'sales' }) },
    groups: {
      labels: groupsUI.groups.map((entry) => entry.label),
      selection: firstGroup ? r.groupSelection(base, firstGroup.group) : null,
      searchNone: r.groupResults(view({ groupSearch: 'zzz-no-match' })).empty,
    },
    statusStrip: r.statusStrip(base),
    models: r.modelList.map((entry) => ({
      id: entry.id,
      selectionLabel: r.selectionLabel(entry.id),
      reportCountText: r.reportCountText(entry.id),
      compareReportCount: r.compareReportCount(entry.id),
      shortReportCount: r.shortReportCount(entry.id),
      securityText: r.modelSecurityText(entry.id),
    })),
    reports: { scope: r.reportScopeText(), status: r.shortReportStatus() },
  };
}
