/** Pure view-model shaping for the lakehouse similarity tables. */

export type Finding = 'duplicate' | 'coverage' | 'similar' | 'distinct' | 'unassessed';
export type SecurityState = 'match' | 'different' | 'not_applicable' | 'unavailable';

export const FINDING_LABELS: Record<Finding, string> = {
  duplicate: 'Possible duplicate',
  coverage: 'Schema coverage',
  similar: 'Shared structure',
  distinct: 'Distinct',
  unassessed: 'Unassessed',
};

export const SECURITY_LABELS: Record<SecurityState, string> = {
  match: 'Security matches',
  different: 'Security differs',
  not_applicable: 'No roles on either',
  unavailable: 'Security unavailable',
};

export interface ModelRef {
  id: string;
  name: string;
  workspace: string;
}

export interface ModelStats {
  tables: number | null;
  columns: number | null;
  measures: number | null;
  relationships: number | null;
  datasources: number | null;
  roles: number | null;
  securityScanStatus: string | null;
}

export interface Signals {
  tables: number | null;
  columns: number | null;
  measureNames: number | null;
  relationships: number | null;
  datasources: number | null;
  daxText: number | null;
}

export interface PairView {
  key: string;
  a: ModelRef;
  b: ModelRef;
  crossWorkspace: boolean;
  combined: number | null;
  schema: number | null;
  security: number | null;
  aInB: number | null;
  bInA: number | null;
  containmentRelationship: string | null;
  scoreMode: string | null;
  finding: Finding;
  securityState: SecurityState;
  signals: Signals;
}

export interface RunSummary {
  analysisRunId: string | null;
  generatedAt: string | null;
  duplicateThreshold: number | null;
  similarThreshold: number | null;
  containmentThreshold: number | null;
  enableBlocking: boolean | null;
  modelCount: number | null;
  pairCount: number | null;
  duplicateCount: number | null;
  similarCount: number | null;
  unassessedCount: number | null;
  containmentCount: number | null;
  clusterCount: number | null;
}

export interface ClusterView {
  id: number;
  members: ModelRef[];
  workspaceCount: number;
  pairs: PairView[];
  bestPair: PairView | null;
  securityDiffers: boolean;
}

export interface ReportRef {
  modelId: string;
  name: string;
  workspace: string;
  url: string | null;
  crossWorkspace: boolean;
}

export interface CatalogError {
  workspace: string;
  model: string;
  errorType: string;
  message: string;
}

export interface SimilarityDataset {
  run: RunSummary | null;
  models: ModelRef[];
  stats: Record<string, ModelStats>;
  pairs: PairView[];
  clusters: ClusterView[];
  reports: ReportRef[];
  errors: CatalogError[];
}

/** Raw rows as returned by the connector (camelCase properties, nullable). */
export interface RawPair {
  modelIdA?: string | null;
  modelA?: string | null;
  workspaceA?: string | null;
  modelIdB?: string | null;
  modelB?: string | null;
  workspaceB?: string | null;
  crossWorkspace?: boolean | null;
  jaccardTables?: number | null;
  jaccardColumns?: number | null;
  jaccardMeasureNames?: number | null;
  jaccardRelationships?: number | null;
  jaccardDatasources?: number | null;
  daxEmbeddingCosine?: number | null;
  containmentRelationship?: string | null;
  modelAInModelB?: number | null;
  modelBInModelA?: number | null;
  tier?: string | null;
  schemaScore?: number | null;
  securityScore?: number | null;
  combinedScore?: number | null;
  scoreMode?: string | null;
  securityComparisonStatus?: string | null;
}

export interface RawModel {
  modelId?: string | null;
  modelName?: string | null;
  workspaceName?: string | null;
}

export interface RawSignature extends RawModel {
  tableCount?: number | null;
  columnCount?: number | null;
  measureCount?: number | null;
  relationshipCount?: number | null;
  datasourceCount?: number | null;
  roleCount?: number | null;
  securityScanStatus?: string | null;
}

export interface RawCluster extends RawModel {
  clusterId?: number | null;
}

export interface RawReport {
  modelId?: string | null;
  reportName?: string | null;
  reportWorkspaceName?: string | null;
  reportUrl?: string | null;
  isCrossWorkspace?: boolean | null;
}

export interface RawCatalogError {
  workspaceName?: string | null;
  modelName?: string | null;
  errorType?: string | null;
  errorMessage?: string | null;
}

const num = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: string | null | undefined): string => (typeof value === 'string' ? value : '');

export function toRunSummary(row: Partial<Record<keyof RunSummary, unknown>> | undefined): RunSummary | null {
  if (!row) return null;
  const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const s = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    analysisRunId: s(row.analysisRunId),
    generatedAt: s(row.generatedAt),
    duplicateThreshold: n(row.duplicateThreshold),
    similarThreshold: n(row.similarThreshold),
    containmentThreshold: n(row.containmentThreshold),
    enableBlocking: typeof row.enableBlocking === 'boolean' ? row.enableBlocking : null,
    modelCount: n(row.modelCount),
    pairCount: n(row.pairCount),
    duplicateCount: n(row.duplicateCount),
    similarCount: n(row.similarCount),
    unassessedCount: n(row.unassessedCount),
    containmentCount: n(row.containmentCount),
    clusterCount: n(row.clusterCount),
  };
}

export const pairKey = (idA: string, idB: string): string => [idA, idB].sort().join('|');

export function toSecurityState(status: string | null | undefined): SecurityState {
  if (status === 'match' || status === 'different' || status === 'not_applicable') {
    return status;
  }
  return 'unavailable';
}

export function toFinding(raw: Pick<RawPair, 'tier' | 'combinedScore' | 'containmentRelationship'>): Finding {
  if (raw.tier === 'duplicate') return 'duplicate';
  if (raw.containmentRelationship && raw.containmentRelationship !== 'partial_overlap') return 'coverage';
  if (raw.tier === 'similar') return 'similar';
  if (raw.tier === 'unassessed' || num(raw.combinedScore) === null) return 'unassessed';
  return 'distinct';
}

function modelRef(
  id: string,
  display: string,
  workspace: string,
  models: Map<string, ModelRef>
): ModelRef {
  const known = models.get(id);
  if (known) return known;
  const prefix = `${workspace} / `;
  return { id, name: display.startsWith(prefix) ? display.slice(prefix.length) : display, workspace };
}

export function toPairView(raw: RawPair, models: Map<string, ModelRef>): PairView | null {
  const idA = text(raw.modelIdA);
  const idB = text(raw.modelIdB);
  if (!idA || !idB) return null;
  const a = modelRef(idA, text(raw.modelA), text(raw.workspaceA), models);
  const b = modelRef(idB, text(raw.modelB), text(raw.workspaceB), models);
  return {
    key: pairKey(idA, idB),
    a,
    b,
    crossWorkspace: raw.crossWorkspace ?? (a.workspace !== b.workspace),
    combined: num(raw.combinedScore),
    schema: num(raw.schemaScore),
    security: num(raw.securityScore),
    aInB: num(raw.modelAInModelB),
    bInA: num(raw.modelBInModelA),
    containmentRelationship: raw.containmentRelationship ?? null,
    scoreMode: raw.scoreMode ?? null,
    finding: toFinding(raw),
    securityState: toSecurityState(raw.securityComparisonStatus),
    signals: {
      tables: num(raw.jaccardTables),
      columns: num(raw.jaccardColumns),
      measureNames: num(raw.jaccardMeasureNames),
      relationships: num(raw.jaccardRelationships),
      datasources: num(raw.jaccardDatasources),
      daxText: num(raw.daxEmbeddingCosine),
    },
  };
}

/** Sort comparator placing unavailable values last. */
export function compareScores(a: number | null, b: number | null, direction: 'asc' | 'desc' = 'desc'): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'desc' ? b - a : a - b;
}

export function buildClusters(rows: RawCluster[], pairs: PairView[], models: Map<string, ModelRef>): ClusterView[] {
  const byCluster = new Map<number, ModelRef[]>();
  for (const row of rows) {
    const id = num(row.clusterId);
    const modelId = text(row.modelId);
    if (id === null || !modelId) continue;
    const ref = models.get(modelId) ?? { id: modelId, name: text(row.modelName), workspace: text(row.workspaceName) };
    byCluster.set(id, [...(byCluster.get(id) ?? []), ref]);
  }
  return [...byCluster.entries()]
    .map(([id, members]) => {
      const ids = new Set(members.map((m) => m.id));
      const clusterPairs = pairs
        .filter((p) => ids.has(p.a.id) && ids.has(p.b.id))
        .sort((x, y) => compareScores(x.combined, y.combined));
      return {
        id,
        members: [...members].sort((x, y) => x.name.localeCompare(y.name)),
        workspaceCount: new Set(members.map((m) => m.workspace)).size,
        pairs: clusterPairs,
        bestPair: clusterPairs[0] ?? null,
        securityDiffers: clusterPairs.some((p) => p.securityState !== 'match' && p.securityState !== 'not_applicable'),
      };
    })
    .sort((x, y) => y.members.length - x.members.length || x.id - y.id);
}

export interface BuildInput {
  run: RunSummary | null;
  models: RawModel[];
  signatures: RawSignature[];
  pairs: RawPair[];
  clusters: RawCluster[];
  reports: RawReport[];
  errors: RawCatalogError[];
}

export function buildDataset(input: BuildInput): SimilarityDataset {
  const models = new Map<string, ModelRef>();
  for (const row of [...input.models, ...input.signatures]) {
    const id = text(row.modelId);
    if (id && !models.has(id)) {
      models.set(id, { id, name: text(row.modelName), workspace: text(row.workspaceName) });
    }
  }
  const stats: Record<string, ModelStats> = {};
  for (const row of input.signatures) {
    const id = text(row.modelId);
    if (!id) continue;
    stats[id] = {
      tables: num(row.tableCount),
      columns: num(row.columnCount),
      measures: num(row.measureCount),
      relationships: num(row.relationshipCount),
      datasources: num(row.datasourceCount),
      roles: num(row.roleCount),
      securityScanStatus: row.securityScanStatus ?? null,
    };
  }
  const pairs = input.pairs
    .map((row) => toPairView(row, models))
    .filter((pair): pair is PairView => pair !== null)
    .sort((x, y) => compareScores(x.combined, y.combined));
  for (const pair of pairs) {
    for (const ref of [pair.a, pair.b]) {
      if (!models.has(ref.id)) models.set(ref.id, ref);
    }
  }
  return {
    run: input.run,
    models: [...models.values()].sort((x, y) => x.name.localeCompare(y.name) || x.workspace.localeCompare(y.workspace)),
    stats,
    pairs,
    clusters: buildClusters(input.clusters, pairs, models),
    reports: input.reports
      .filter((row) => text(row.modelId))
      .map((row) => ({
        modelId: text(row.modelId),
        name: text(row.reportName) || 'Unnamed report',
        workspace: text(row.reportWorkspaceName),
        url: safeUrl(row.reportUrl),
        crossWorkspace: row.isCrossWorkspace === true,
      })),
    errors: input.errors.map((row) => ({
      workspace: text(row.workspaceName),
      model: text(row.modelName),
      errorType: text(row.errorType) || 'Error',
      message: text(row.errorMessage),
    })),
  };
}

/** Only allow https links into Fabric/Power BI. */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)(powerbi\.com|fabric\.microsoft\.com)$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export type CellState = 'scored' | 'unscored' | 'unavailable' | 'self';

export interface MapCell {
  row: ModelRef;
  column: ModelRef;
  state: CellState;
  value: number | null;
  pair: PairView | null;
}

/** Models with the strongest scored pairs first, capped for a readable matrix. */
export function selectMapModels(dataset: Pick<SimilarityDataset, 'models' | 'pairs'>, limit = 40, offset = 0): ModelRef[] {
  const best = new Map<string, number>();
  for (const pair of dataset.pairs) {
    for (const id of [pair.a.id, pair.b.id]) {
      best.set(id, Math.max(best.get(id) ?? -1, pair.combined ?? -1));
    }
  }
  return [...dataset.models]
    .sort((x, y) => (best.get(y.id) ?? -2) - (best.get(x.id) ?? -2) || x.name.localeCompare(y.name))
    .slice(offset, offset + limit);
}

export function buildMapCells(models: ModelRef[], pairs: PairView[]): MapCell[] {
  const byKey = new Map(pairs.map((pair) => [pair.key, pair]));
  const cells: MapCell[] = [];
  for (const row of models) {
    for (const column of models) {
      if (row.id === column.id) {
        cells.push({ row, column, state: 'self', value: null, pair: null });
        continue;
      }
      const pair = byKey.get(pairKey(row.id, column.id)) ?? null;
      const state: CellState = !pair ? 'unscored' : pair.combined === null ? 'unavailable' : 'scored';
      cells.push({ row, column, state, value: pair?.combined ?? null, pair });
    }
  }
  return cells;
}

export const formatPercent = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';

export const modelLabel = (model: ModelRef): string => (model.workspace ? `${model.name} · ${model.workspace}` : model.name);
