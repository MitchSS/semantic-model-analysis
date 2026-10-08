import { getRayfinClient } from '@/lib/rayfin-client';

import { buildPayload, type RawRows, type ResultsPayload, type Row } from './payload';

/**
 * Upper bound for one table read (Data API builder's default maximum page size).
 * Tables are read in a single request, never by cursor: the lakehouse tables are keyless, so the
 * connector's cursor key (the first column, e.g. `workspace_id`) is not unique and `after` paging
 * silently skips every row that shares the last key of a page.
 */
export const MAX_ROWS = 100_000;

interface Page {
  items: Row[];
  hasNextPage: boolean;
}

/** One-request read; more rows than {@link MAX_ROWS} are reported as truncated, not paged. */
export async function readAll(fetch: (first: number) => Promise<Page>): Promise<{ rows: Row[]; truncated: boolean }> {
  const page = await fetch(MAX_ROWS);
  return { rows: page.items.slice(0, MAX_ROWS), truncated: page.hasNextPage || page.items.length > MAX_ROWS };
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

export function toRunSummary(row: Row | undefined): RunSummary | null {
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

export interface LoadedResults {
  payload: ResultsPayload;
  run: RunSummary | null;
  truncated: boolean;
  errors: { workspace: string; model: string; errorType: string; message: string }[];
}

interface Paginated {
  first(n: number): { executePaginated(): Promise<Page> };
}

// Columns are typed by each entity's `select`, so a misspelled column fails typecheck.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reader<E extends { select: (columns: any) => unknown }>(entity: E, columns: Parameters<E['select']>[0]) {
  return readAll((first) => (entity.select(columns) as unknown as Paginated).first(first).executePaginated());
}

export async function loadResults(): Promise<LoadedResults> {
  const client = await getRayfinClient();
  const lake = client.connectors.similaritylakehouse;
  const optional = async (read: Promise<{ rows: Row[]; truncated: boolean }>) => {
    try {
      return await read;
    } catch {
      return null;
    }
  };

  const [run, models, signatures, pairs, tables, columns, measures, relationships, datasources, queries, errors, reports, reportScans] =
    await Promise.all([
      reader(lake.SemanticModelSimilarityRun, [
        'generatedAt', 'analysisRunId', 'catalogScanId', 'scoreVersion', 'duplicateThreshold', 'similarThreshold',
        'containmentThreshold', 'enableBlocking', 'combinedWeightsJson', 'modelCount', 'pairCount', 'duplicateCount',
        'similarCount', 'unassessedCount', 'containmentCount', 'clusterCount',
      ]),
      reader(lake.SemanticModels, ['workspaceId', 'workspaceName', 'modelId', 'modelName', 'catalogScanId']),
      reader(lake.SemanticModelSignatures, [
        'modelId', 'workspaceId', 'workspaceName', 'modelName', 'analysisRunId', 'catalogScanId', 'scoreVersion',
        'securityScanStatus', 'securityFingerprint', 'roleCount',
      ]),
      reader(lake.SemanticModelSimilarityPairs, [
        'modelIdA', 'modelA', 'workspaceA', 'modelIdB', 'modelB', 'workspaceB', 'sameModelName', 'crossWorkspace',
        'jaccardTables', 'jaccardColumns', 'jaccardMeasureNames', 'jaccardRelationships', 'jaccardDatasources',
        'daxEmbeddingCosine', 'compositeScore', 'containmentScore', 'containmentRelationship', 'modelAInModelB',
        'modelBInModelA', 'schemaScore', 'securityScore', 'combinedScore', 'scoreMode', 'securityComparisonStatus',
        'securityEvidenceJson', 'securityFingerprintA', 'securityFingerprintB', 'catalogScanIdA', 'catalogScanIdB',
        'analysisRunId', 'scoreVersion', 'powerQuerySimilarity', 'powerQueryStatus', 'sharedQueryCount',
      ]),
      reader(lake.SemanticModelTables, ['modelId', 'tableName']),
      reader(lake.SemanticModelColumns, ['modelId', 'tableName', 'columnName']),
      reader(lake.SemanticModelMeasures, ['modelId', 'measureName', 'expression']),
      reader(lake.SemanticModelRelationships, ['modelId', 'fromTable', 'fromColumn', 'toTable', 'toColumn']),
      reader(lake.SemanticModelDatasources, ['modelId', 'datasourceName', 'datasourceType', 'connectionString', 'connectionDetails']),
      reader(lake.SemanticModelQueries, ['modelId', 'tableName', 'partitionName', 'queryKind', 'expression', 'expressionHash']),
      optional(reader(lake.SemanticModelCatalogErrors, ['workspaceName', 'modelName', 'errorType', 'errorMessage'])),
      optional(
        reader(lake.SemanticModelReportDependencies, [
          'scanId', 'scannedAt', 'reportWorkspaceId', 'reportWorkspaceName', 'reportId', 'reportName', 'reportType',
          'modelId', 'bindingStatus',
        ])
      ),
      optional(reader(lake.SemanticModelReportScan, ['scanId', 'scannedAt', 'reportWorkspaceId', 'reportWorkspaceName', 'scanStatus', 'reportCount', 'errorType', 'scanScope'])),
    ]);

  const raw: RawRows = {
    run: run.rows,
    models: models.rows,
    signatures: signatures.rows,
    pairs: pairs.rows,
    tables: tables.rows,
    columns: columns.rows,
    measures: measures.rows,
    relationships: relationships.rows,
    datasources: datasources.rows,
    queries: queries.rows,
    reports: reports?.rows ?? null,
    reportScans: reportScans?.rows ?? null,
  };
  const results = [run, models, signatures, pairs, tables, columns, measures, relationships, datasources, queries, errors, reports, reportScans];
  return {
    payload: buildPayload(raw),
    run: toRunSummary(run.rows[0]),
    truncated: results.some((result) => result?.truncated),
    errors: (errors?.rows ?? []).map((row) => ({
      workspace: String(row.workspaceName ?? ''),
      model: String(row.modelName ?? ''),
      errorType: String(row.errorType ?? 'Error'),
      message: String(row.errorMessage ?? ''),
    })),
  };
}
