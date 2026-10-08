/**
 * Results view logic — a faithful port of notebook 002's renderer functions (tierAt, classify,
 * candidates, reviewSelection, buildGroups, compareData, mapSelection, …). Parity tests run
 * both implementations on the same payload, so keep behaviour and wording identical.
 */
import type { PayloadModel, PayloadPair, ReportEntry, ResultsPayload } from './payload';

export interface Thresholds {
  duplicate: number;
  similar: number;
  containment: number;
}

export type FindingKind = 'duplicate' | 'containment' | 'overlap';
export type SortKey = 'rank' | 'combined' | 'schema' | 'security';

export interface ViewState {
  thresholds: Thresholds;
  crossOnly: boolean;
  filter: 'all' | FindingKind;
  search: string;
  workspace: string;
  security: string;
  powerQuery: string;
  sort: SortKey;
  sortDirection: 'asc' | 'desc';
  page: number;
  pageSize: number;
  groupSearch: string;
  mapSearch: string;
  mapWorkspace: string;
  mapPage: number;
  mapSize: number;
  cmpDiffOnly: boolean;
}

export const LABELS: Record<FindingKind, string> = {
  duplicate: 'Possible duplicates',
  containment: 'Schema coverage',
  overlap: 'Shared structure',
};
export const COVERAGE_MEANING =
  'A weighted match across cataloged schema definitions, not a percentage of objects or data values. Security is excluded.';
export const SCORE_DIFFERENCE =
  'Schema similarity compares both complete models. Extra content can lower this score even when one model has high coverage within the other.';
export const REVIEW_CAUTION = 'This is a review candidate, not confirmation that one model can replace the other.';

export function defaultThresholds(data: ResultsPayload): Thresholds {
  const t = data.thresholds ?? { duplicate: 0.95, similar: 0.7, containment: 0.95 };
  return { duplicate: t.duplicate ?? 0.95, similar: t.similar ?? 0.7, containment: t.containment ?? 0.95 };
}

export function initialViewState(data: ResultsPayload): ViewState {
  return {
    thresholds: defaultThresholds(data),
    crossOnly: false,
    filter: 'all',
    search: '',
    workspace: 'all',
    security: 'all',
    powerQuery: 'all',
    sort: 'rank',
    sortDirection: 'desc',
    page: 1,
    pageSize: 25,
    groupSearch: '',
    mapSearch: '',
    mapWorkspace: 'all',
    mapPage: 1,
    mapSize: 40,
    cmpDiffOnly: true,
  };
}

export const validScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export const score = (value: unknown) => (validScore(value) ? (Math.round(value * 1000) / 10).toFixed(1) + '%' : 'Unavailable');
export const pairKey = (a: string, b: string) => [String(a), String(b)].sort().join('|');

export interface Candidate {
  pair: PayloadPair;
  category: { kind: FindingKind; label: string; rank: number; primary: number };
}

/** Bundles a payload with its derived lookups so view functions stay cheap. */
export class Results {
  readonly pairIndex: Map<string, PayloadPair>;
  readonly modelList;

  constructor(readonly data: ResultsPayload) {
    this.pairIndex = new Map((data.allPairs ?? []).map((pair) => [pairKey(pair.idA, pair.idB), pair]));
    this.modelList = data.modelList ?? [];
  }

  model(id: string): PayloadModel {
    return (
      this.data.models[id] ?? {
        name: id || 'Model unavailable',
        workspace: '',
        workspaceId: '',
        tables: [], columns: [], measures: [], relationships: [], datasources: [], queries: [],
        security: { status: 'not_collected', fingerprint: null, roleCount: null },
      }
    );
  }

  modelWorkspaceId(id: string): string {
    const value = this.model(id).workspaceId;
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  inComparisonScope(state: Pick<ViewState, 'crossOnly'>, a: string, b: string): boolean {
    const first = this.modelWorkspaceId(a);
    const second = this.modelWorkspaceId(b);
    return !state.crossOnly || Boolean(first && second && first !== second);
  }

  scopeExclusion(a: string, b: string): string {
    return this.modelWorkspaceId(a) && this.modelWorkspaceId(b) ? 'Same workspace' : 'Workspace unknown';
  }

  pair(a: string, b: string): PayloadPair | undefined {
    return this.pairIndex.get(pairKey(a, b));
  }

  pairModelLabel(id: string, otherId: string): string {
    const entry = this.model(id);
    const other = this.model(otherId);
    let label = entry.name;
    if (String(entry.name).toLowerCase() === String(other.name).toLowerCase()) {
      label += ` (Workspace: ${entry.workspace || 'Unavailable'})`;
      if (String(entry.workspace).toLowerCase() === String(other.workspace).toLowerCase()) label += ` [${id}]`;
    }
    return label;
  }

  selectionLabel(id: string): string {
    const entry = this.model(id);
    const duplicate = this.modelList.some((other) => other.id !== id && other.name === entry.name && other.workspace === entry.workspace);
    return `${entry.name} / ${entry.workspace || 'Unknown workspace'}${duplicate ? ` [${id}]` : ''}`;
  }

  daxText(item: { daxId: number } | undefined): string {
    return item && item.daxId >= 0 ? this.data.daxPool[item.daxId] ?? '' : '';
  }

  mText(item: { mId: number } | undefined): string {
    return item && item.mId >= 0 ? (this.data.mPool ?? [])[item.mId] ?? '' : '';
  }

  // ---- classification ----------------------------------------------------------------------

  tierAt(state: Pick<ViewState, 'thresholds'>, value: unknown): 'duplicate' | 'similar' | 'distinct' | 'unassessed' {
    if (!validScore(value)) return 'unassessed';
    return value >= state.thresholds.duplicate ? 'duplicate' : value >= state.thresholds.similar ? 'similar' : 'distinct';
  }

  coverageContext(state: Pick<ViewState, 'thresholds'>, pair: PayloadPair | undefined) {
    const directions = pair
      ? [
          { sourceId: pair.idA, targetId: pair.idB, value: pair.aInB },
          { sourceId: pair.idB, targetId: pair.idA, value: pair.bInA },
        ]
      : [];
    const available = directions.filter((d) => d.sourceId && d.targetId && validScore(d.value));
    const strongest = available.reduce<(typeof directions)[number] | null>((best, d) => (!best || (d.value as number) > (best.value as number) ? d : best), null);
    const matches = available.filter((d) => (d.value as number) >= state.thresholds.containment);
    return { directions, strongest, both: matches.length === 2, qualifies: matches.length > 0 };
  }

  classify(state: Pick<ViewState, 'thresholds'>, pair: PayloadPair): Candidate['category'] | null {
    const tier = this.tierAt(state, pair.combined);
    const context = this.coverageContext(state, pair);
    const coverage = context.strongest ? context.strongest.value : validScore(pair.containedCoverage) ? pair.containedCoverage : pair.containment;
    if (tier === 'duplicate') return { kind: 'duplicate', label: LABELS.duplicate, rank: 0, primary: pair.combined as number };
    if (validScore(coverage) && coverage >= state.thresholds.containment) {
      return { kind: 'containment', label: LABELS.containment, rank: 1, primary: coverage };
    }
    if (tier === 'similar') return { kind: 'overlap', label: LABELS.overlap, rank: 2, primary: pair.combined as number };
    return null;
  }

  candidates(state: Pick<ViewState, 'thresholds' | 'crossOnly'>): Candidate[] {
    return (this.data.allPairs ?? [])
      .filter((pair) => this.inComparisonScope(state, pair.idA, pair.idB))
      .map((pair) => {
        const category = this.classify(state, pair);
        return category ? { pair, category } : null;
      })
      .filter((item): item is Candidate => item !== null)
      .sort((a, b) => a.category.rank - b.category.rank || b.category.primary - a.category.primary);
  }

  buildGroups(state: Pick<ViewState, 'thresholds' | 'crossOnly'>) {
    const duplicates = (this.data.allPairs ?? []).filter(
      (pair) => this.inComparisonScope(state, pair.idA, pair.idB) && this.tierAt(state, pair.combined) === 'duplicate'
    );
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const add = (x: string) => {
      if (!parent.has(x)) parent.set(x, x);
    };
    const join = (a: string, b: string) => {
      add(a);
      add(b);
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    duplicates.forEach((pair) => join(pair.idA, pair.idB));
    const grouped = new Map<string, string[]>();
    for (const id of parent.keys()) {
      const root = find(id);
      grouped.set(root, [...(grouped.get(root) ?? []), id]);
    }
    const groups: { members: string[]; strongest: PayloadPair; securityDifferent: boolean; securityUnknown: boolean }[] = [];
    for (const members of grouped.values()) {
      if (members.length < 2) continue;
      let strongest: PayloadPair | null = null;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const pair = this.pair(members[i], members[j]);
          if (
            pair &&
            this.inComparisonScope(state, pair.idA, pair.idB) &&
            this.tierAt(state, pair.combined) === 'duplicate' &&
            (!strongest || (pair.combined as number) > (strongest.combined as number))
          ) {
            strongest = pair;
          }
        }
      }
      if (!strongest) continue;
      members.sort(
        (a, b) =>
          (this.model(a).name || '').localeCompare(this.model(b).name || '') ||
          (this.model(a).workspace || '').localeCompare(this.model(b).workspace || '')
      );
      const fingerprints = new Set<string | null>();
      let unknown = false;
      for (const id of members) {
        const security = this.model(id).security ?? {};
        if (security.status === 'complete') fingerprints.add(security.fingerprint);
        else unknown = true;
      }
      groups.push({ members, strongest, securityDifferent: fingerprints.size > 1, securityUnknown: unknown });
    }
    groups.sort((a, b) => b.members.length - a.members.length || (b.strongest.combined as number) - (a.strongest.combined as number));
    return groups;
  }

  groupKey(group: { members: string[] }): string {
    return JSON.stringify([...group.members].sort());
  }

  groupSelection(
    state: Pick<ViewState, 'crossOnly'>,
    group: { members: string[]; strongest: PayloadPair },
    current?: { a: string; b: string }
  ): { chosen: { a: string; b: string }; options: string[] } {
    let chosen = current && group.members.includes(current.a) ? current : { a: group.strongest.idA, b: group.strongest.idB };
    const options = group.members.filter((id) => id !== chosen.a && this.inComparisonScope(state, chosen.a, id));
    if (!options.includes(chosen.b)) chosen = { a: chosen.a, b: options[0] || '' };
    return { chosen, options };
  }

  groupResults(state: ViewState) {
    const all = this.buildGroups(state);
    const query = state.groupSearch.trim().toLowerCase();
    const groups = all
      .map((group, index) => ({ group, label: `Group ${index + 1}`, key: this.groupKey(group) }))
      .filter(
        (entry) =>
          !query ||
          entry.group.members.some((id) => {
            const model = this.model(id);
            return `${model.name} ${model.workspace}`.toLowerCase().includes(query);
          })
      );
    const empty = groups.length
      ? ''
      : all.length
        ? 'No groups match this search.'
        : state.crossOnly
          ? 'No cross-workspace duplicate groups at this cutoff.'
          : 'No possible-duplicate groups.';
    return { all, groups, empty };
  }

  // ---- review ------------------------------------------------------------------------------

  workspaceKey(id: string): string {
    return this.modelWorkspaceId(id) || String(this.model(id).workspace || 'Unknown');
  }

  workspaceOptions(): [string, string][] {
    const entries = new Map<string, string>();
    for (const entry of this.modelList) {
      const key = this.workspaceKey(entry.id);
      if (!entries.has(key)) entries.set(key, entry.workspace || 'Unknown');
    }
    const options = [...entries.entries()];
    const counts = new Map<string, number>();
    options.forEach(([, label]) => counts.set(label, (counts.get(label) ?? 0) + 1));
    return options
      .map(([key, label]): [string, string] => [key, label + ((counts.get(label) ?? 0) > 1 ? ` [${key}]` : '')])
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  }

  powerQueryDiffers(pair: PayloadPair): boolean {
    return pair.powerQueryStatus === 'one_sided' || (pair.powerQueryStatus === 'compared' && validScore(pair.powerQuery) && pair.powerQuery < 1);
  }

  reviewSelection(state: ViewState) {
    const all = this.candidates(state);
    const query = state.search.trim().toLowerCase();
    const base = all.filter(({ pair }) => {
      const a = this.model(pair.idA);
      const b = this.model(pair.idB);
      const powerQuery =
        state.powerQuery === 'all' ||
        (state.powerQuery === 'differs'
          ? this.powerQueryDiffers(pair)
          : state.powerQuery === 'matches'
            ? pair.powerQueryStatus === 'compared' && !this.powerQueryDiffers(pair)
            : pair.powerQueryStatus === state.powerQuery);
      return (
        (!query || [a.name, a.workspace, b.name, b.workspace].join(' ').toLowerCase().includes(query)) &&
        (state.workspace === 'all' || this.workspaceKey(pair.idA) === state.workspace || this.workspaceKey(pair.idB) === state.workspace) &&
        (state.security === 'all' || pair.securityStatus === state.security) &&
        powerQuery
      );
    });
    const counts: Record<FindingKind, number> = { duplicate: 0, containment: 0, overlap: 0 };
    base.forEach((item) => counts[item.category.kind]++);
    const rows = base.filter((item) => state.filter === 'all' || item.category.kind === state.filter);
    rows.sort((first, second) => {
      let order = 0;
      if (state.sort === 'rank') {
        order = first.category.rank - second.category.rank || second.category.primary - first.category.primary;
      } else {
        const left = first.pair[state.sort];
        const right = second.pair[state.sort];
        if (!validScore(left) || !validScore(right)) order = validScore(left) ? -1 : validScore(right) ? 1 : 0;
        else order = (left - right) * (state.sortDirection === 'asc' ? 1 : -1);
      }
      return order || pairKey(first.pair.idA, first.pair.idB).localeCompare(pairKey(second.pair.idA, second.pair.idB));
    });
    return { all, base, rows, counts };
  }

  reviewEmptyText(state: ViewState, selection: { all: Candidate[] }): string {
    if (!this.modelList.length) return 'No cataloged models. Run notebook 001.';
    if (this.modelList.length < 2) return 'Two models are required.';
    if (!selection.all.length) return state.crossOnly ? 'No cross-workspace candidates meet the current thresholds.' : 'No candidates meet the current thresholds.';
    return 'No candidates match these filters.';
  }

  // ---- wording ------------------------------------------------------------------------------

  securityLabel(pair: PayloadPair | undefined): string {
    if (!pair) return 'Not scored';
    const labels: Record<string, string> = {
      match: 'Matching definitions',
      different: 'Security definitions differ',
      not_applicable: 'Not applicable',
      unknown: 'Security not assessed',
    };
    return labels[pair.securityStatus] ?? 'Security not assessed';
  }

  securityTag(pair: PayloadPair | undefined): { label: string; warning: boolean } {
    const status = pair ? pair.securityStatus : 'unscored';
    const labels: Record<string, string> = {
      match: 'Security matches',
      different: 'Security differs',
      not_applicable: 'No model roles',
      unknown: 'Not assessed',
      unscored: 'Not scored',
    };
    return { label: labels[status] ?? labels.unknown, warning: status === 'different' || status === 'unknown' };
  }

  securityScoreText(pair: PayloadPair | undefined): string {
    return pair && pair.securityStatus === 'not_applicable' ? 'Not applicable' : score(pair ? pair.security : null);
  }

  blendText(pair: PayloadPair | undefined): string {
    if (!pair) return 'No saved score for this pair.';
    if (pair.scoreMode === 'schema_only_no_security') return 'No model-level security definitions in either model: overall equals schema.';
    if (!validScore(pair.combined)) return 'A complete security comparison is required for the overall score.';
    const weights = this.data.combinedWeights;
    return weights ? `${score(weights.schema)} schema + ${score(weights.security)} security.` : 'Overall weights unavailable.';
  }

  relationshipText(state: Pick<ViewState, 'thresholds'>, pair: PayloadPair | undefined, category: Candidate['category'] | null): string {
    if (!pair) return 'This pair has no saved analysis score.';
    if (!category) {
      return validScore(pair.combined)
        ? 'This pair does not meet the current review thresholds.'
        : 'Overall similarity is unavailable; schema evidence remains separate.';
    }
    if (category.kind === 'duplicate') {
      return (pair.combined as number) >= 0.95 ? 'These models have very high overall similarity.' : 'These models meet the possible-duplicate threshold.';
    }
    if (category.kind === 'containment') {
      const context = this.coverageContext(state, pair);
      const direction = context.strongest;
      if (context.both) return 'Both models meet the schema coverage threshold.';
      if (!direction) return 'Schema coverage was flagged, but its direction is unavailable.';
      const source = this.pairModelLabel(direction.sourceId, direction.targetId);
      const target = this.pairModelLabel(direction.targetId, direction.sourceId);
      return (direction.value as number) >= 0.95
        ? `Almost all of ${source} is represented in ${target}.`
        : `${source} has a ${score(direction.value)} schema coverage score within ${target}.`;
    }
    return 'These models meet the overall-similarity threshold, below the possible-duplicate threshold.';
  }

  relationshipSummary(state: Pick<ViewState, 'thresholds'>, pair: PayloadPair | undefined): string {
    if (!pair) return 'Not scored';
    const category = this.classify(state, pair);
    return category ? category.label : 'Below review cutoffs or unavailable';
  }

  containmentSummary(state: Pick<ViewState, 'thresholds'>, pair: PayloadPair | undefined): string {
    if (!pair) return 'Not scored';
    const context = this.coverageContext(state, pair);
    if (!context.strongest) return 'Directional coverage unavailable';
    if (context.directions.some((direction) => !validScore(direction.value))) {
      return 'Coverage comparison is incomplete: one directional score is unavailable.';
    }
    const threshold = score(state.thresholds.containment);
    if (context.both) return `Both models meet the schema coverage threshold (${threshold}).`;
    if (context.qualifies) return `One direction meets the schema coverage threshold (${threshold}).`;
    return `Neither direction meets the schema coverage threshold (${threshold}).`;
  }

  directionLabel(direction: { sourceId: string; targetId: string }): string {
    return `${this.pairModelLabel(direction.sourceId, direction.targetId)} within ${this.pairModelLabel(direction.targetId, direction.sourceId)}`;
  }

  relevantSection(pair: PayloadPair | undefined): string {
    if (!pair) return 'tables';
    if (pair.securityStatus === 'different' || pair.securityStatus === 'unknown') return 'security';
    const overlap = pair.jaccard ?? {};
    const values: [string, number | null | undefined][] = [
      ['tables', overlap.tables],
      ['measures', Math.min(validScore(overlap.measures) ? overlap.measures : 1, validScore(pair.daxCosine) ? pair.daxCosine : 1)],
      ['relationships', overlap.relationships],
      ['datasources', overlap.datasources],
      ['queries', pair.powerQueryStatus === 'not_applicable' ? null : pair.powerQuery],
    ];
    values.sort((a, b) => (validScore(a[1]) ? a[1] : 1) - (validScore(b[1]) ? b[1] : 1));
    return values[0][0];
  }

  schemaSignals(pair: PayloadPair): { label: string; value: number | null; unavailable: string }[] {
    const overlap = pair.jaccard ?? ({} as PayloadPair['jaccard']);
    const hasMeasures = this.model(pair.idA).measures.length > 0 && this.model(pair.idB).measures.length > 0;
    return [
      { label: 'Table-name overlap', value: overlap.tables, unavailable: 'Unavailable' },
      { label: 'Column-name overlap', value: overlap.columns, unavailable: 'Unavailable' },
      { label: 'Measure-name overlap', value: overlap.measures, unavailable: 'Unavailable' },
      { label: hasMeasures ? 'DAX text similarity' : 'Model text similarity', value: pair.daxCosine, unavailable: 'Unavailable' },
      { label: 'Relationship-link overlap', value: overlap.relationships, unavailable: 'Unavailable' },
      { label: 'Source-definition overlap', value: overlap.datasources, unavailable: 'Unavailable' },
      {
        label: 'Power Query similarity',
        value: pair.powerQuery,
        unavailable: pair.powerQueryStatus === 'not_applicable' ? 'Not applicable' : 'Unavailable',
      },
    ];
  }

  // ---- compare -----------------------------------------------------------------------------

  statusLabel(status: DiffStatus, firstName: string, secondName: string): string {
    return status === 'onlyA'
      ? `Only in ${firstName}`
      : status === 'onlyB'
        ? `Only in ${secondName}`
        : status === 'changed'
          ? 'Different formula text'
          : 'Matching entry';
  }

  compareData(state: Pick<ViewState, 'cmpDiffOnly'>, a: PayloadModel, b: PayloadModel): CompareData {
    const result: CompareData = { sections: {}, shared: 0, differences: 0 };
    const indexBy = <T extends { key: string }>(list: T[] | undefined) => {
      const out: Record<string, T> = {};
      (list ?? []).forEach((item) => (out[item.key] = item));
      return out;
    };
    const unionKeys = (left: object, right: object) => [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    const simple = <T extends { key: string }>(id: SectionId, left: Record<string, T>, right: Record<string, T>, format: (item: T) => string) => {
      const rows: DiffRow[] = [];
      let shared = 0;
      let diff = 0;
      for (const key of unionKeys(left, right)) {
        const status: DiffStatus = left[key] && right[key] ? 'shared' : left[key] ? 'onlyA' : 'onlyB';
        if (status === 'shared') shared++;
        else diff++;
        if (!state.cmpDiffOnly || status !== 'shared') rows.push({ key, status, text: format(left[key] || right[key]) });
      }
      result.sections[id] = { rows, shared, diff };
      result.shared += shared;
      result.differences += diff;
    };
    const textual = <T extends { key: string; name: string }>(
      id: SectionId,
      left: Record<string, T>,
      right: Record<string, T>,
      hash: (item: T) => string,
      text: (item: T | undefined) => string
    ) => {
      const rows: DiffRow[] = [];
      let shared = 0;
      let diff = 0;
      for (const key of unionKeys(left, right)) {
        const ia = left[key];
        const ib = right[key];
        const status: DiffStatus = ia && ib ? (hash(ia) === hash(ib) ? 'shared' : 'changed') : ia ? 'onlyA' : 'onlyB';
        if (status === 'shared') shared++;
        else diff++;
        if (!state.cmpDiffOnly || status !== 'shared') {
          const item = ia || ib;
          rows.push({
            key,
            status,
            text: item.name,
            detail: status === 'changed' ? { a: text(ia), b: text(ib) } : status !== 'shared' ? { single: text(item) } : undefined,
          });
        }
      }
      result.sections[id] = { rows, shared, diff };
      result.shared += shared;
      result.differences += diff;
    };
    simple('tables', indexBy(a.tables), indexBy(b.tables), (x) => x.name);
    simple('columns', indexBy(a.columns), indexBy(b.columns), (x) => `${x.table}[${x.name}]`);
    textual('measures', indexBy(a.measures), indexBy(b.measures), (x) => x.daxHash, (x) => this.daxText(x));
    simple('relationships', indexBy(a.relationships), indexBy(b.relationships), (x) => `${x.from} → ${x.to}`);
    simple('datasources', indexBy(a.datasources), indexBy(b.datasources), (x) => x.name);
    textual('queries', indexBy(a.queries), indexBy(b.queries), (x) => x.mHash, (x) => this.mText(x));
    return result;
  }

  // ---- reports -----------------------------------------------------------------------------

  get reports() {
    return this.data.reportDependencies;
  }

  reportsAvailable(): boolean {
    return this.reports.status === 'complete' || this.reports.status === 'partial';
  }

  reportsFor(id: string): ReportEntry[] {
    return this.reportsAvailable() ? this.reports.byModel?.[id] ?? [] : [];
  }

  reportCountText(id: string): string {
    if (!this.reportsAvailable()) return 'Report dependencies unknown';
    const count = this.reportsFor(id).length;
    if (this.reports.status === 'partial') {
      return count ? `${count} known linked report${count === 1 ? '' : 's'} (scan incomplete)` : 'No linked reports found (scan incomplete)';
    }
    return `${count} linked report${count === 1 ? '' : 's'} in scanned scope`;
  }

  compareReportCount(id: string): string {
    return this.reportsAvailable() ? `${this.reportsFor(id).length}${this.reports.status === 'partial' ? ' known reports' : ' linked reports'}` : 'Unknown';
  }

  shortReportCount(id: string): string {
    return this.reportsAvailable() ? `${this.reportsFor(id).length}${this.reports.status === 'partial' ? ' known' : ' reports'}` : 'Unknown';
  }

  shortReportStatus(): string {
    const labels: Record<string, string> = {
      complete: 'Complete',
      partial: 'Partial',
      not_collected: 'Not collected',
      unavailable: 'Unavailable',
      inconsistent: 'Inconsistent',
    };
    return labels[this.reports.status] ?? 'Unknown';
  }

  reportScopeText(): string {
    const scope = this.reports.scope || 'Unknown';
    if (scope === 'visible_workspaces') return 'Visible workspaces';
    if (scope === 'admin_workspaces') return 'Active regular workspaces (admin discovery)';
    if (scope.startsWith('admin_workspace_filter:')) return `${scope.slice('admin_workspace_filter:'.length)} (admin discovery)`;
    return scope.startsWith('workspace_filter:') ? scope.slice('workspace_filter:'.length) : scope;
  }

  modelSecurityText(id: string): string {
    const security = this.model(id).security ?? {};
    if (security.status !== 'complete') return 'Security not assessed';
    return security.roleCount
      ? `${security.roleCount} security role${security.roleCount === 1 ? '' : 's'}`
      : 'No model-level security roles';
  }

  statusStrip(state: Pick<ViewState, 'crossOnly'>) {
    const unknown = this.modelList.filter((entry) => (this.model(entry.id).security ?? {}).status !== 'complete').length;
    const unknownWorkspace = state.crossOnly ? this.modelList.filter((entry) => !this.modelWorkspaceId(entry.id)).length : 0;
    const security = unknown
      ? `${unknown} model${unknown === 1 ? '' : 's'} not assessed`
      : this.data.securityNotice
        ? 'Analysis needs review'
        : 'Assessed';
    return {
      security,
      securityWarning: Boolean(unknown || this.data.securityNotice),
      reports: this.shortReportStatus(),
      reportsWarning: this.reports.status !== 'complete',
      unknownWorkspace,
    };
  }

  // ---- map ---------------------------------------------------------------------------------

  mapSelection(state: Pick<ViewState, 'mapSearch' | 'mapWorkspace' | 'mapPage' | 'mapSize'>) {
    const query = state.mapSearch.trim().toLowerCase();
    const models = this.modelList.filter(
      (entry) =>
        (!query || `${entry.name} ${entry.workspace}`.toLowerCase().includes(query)) &&
        (state.mapWorkspace === 'all' || this.workspaceKey(entry.id) === state.mapWorkspace)
    );
    const pages = Math.max(1, Math.ceil(models.length / state.mapSize));
    const page = Math.max(1, Math.min(state.mapPage, pages));
    const start = (page - 1) * state.mapSize;
    return { models, visible: models.slice(start, start + state.mapSize), pages, page, start };
  }

  mapCell(state: Pick<ViewState, 'thresholds' | 'crossOnly'>, rowId: string, columnId: string): MapCell {
    const row = this.model(rowId);
    const column = this.model(columnId);
    const rowLabel = `${row.name} (Workspace: ${row.workspace})`;
    const columnLabel = `${column.name} (Workspace: ${column.workspace})`;
    const pairLabel = `${rowLabel} and ${columnLabel}`;
    if (rowId === columnId) return { kind: 'diagonal', style: 'diagonal', text: '—', detail: `${rowLabel}: same model` };
    if (!this.inComparisonScope(state, rowId, columnId)) {
      return { kind: 'outside', style: 'outside', text: '×', detail: `${pairLabel}: Outside scope (${this.scopeExclusion(rowId, columnId)})` };
    }
    const pair = this.pair(rowId, columnId);
    if (!pair) return { kind: 'unscored', style: 'unscored', text: '·', detail: `${pairLabel}: Not scored` };
    const tier = this.tierAt(state, pair.combined);
    const available = validScore(pair.combined);
    const style = !available ? 'unavailable' : tier === 'duplicate' ? 'duplicate' : tier === 'similar' ? 'high' : 'low';
    const description = `Overall ${score(pair.combined)}; schema ${score(pair.schema)}; security ${this.securityScoreText(pair)}; ${this.securityLabel(pair)}`;
    return {
      kind: 'scored',
      style,
      text: available ? `${Math.round((pair.combined as number) * 100)}%` : '?',
      detail: `${pairLabel}: ${description}`,
    };
  }
}

export type SectionId = 'tables' | 'columns' | 'measures' | 'relationships' | 'datasources' | 'queries';
export type DiffStatus = 'shared' | 'changed' | 'onlyA' | 'onlyB';
export interface DiffRow {
  key: string;
  status: DiffStatus;
  text: string;
  detail?: { a: string; b: string } | { single: string };
}
export interface CompareData {
  sections: Partial<Record<SectionId, { rows: DiffRow[]; shared: number; diff: number }>>;
  shared: number;
  differences: number;
}
export interface MapCell {
  kind: 'diagonal' | 'outside' | 'unscored' | 'scored';
  style: 'diagonal' | 'outside' | 'unscored' | 'unavailable' | 'duplicate' | 'high' | 'low';
  text: string;
  detail: string;
}
