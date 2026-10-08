import { getRayfinClient } from './rayfin-client';
import {
  buildDataset,
  type RawCatalogError,
  type RawCluster,
  type RawModel,
  type RawPair,
  type RawReport,
  type RawSignature,
  type SimilarityDataset,
  toRunSummary,
} from './similarity-model';

const PAGE_SIZE = 1000;
/** Guard against unbounded reads from a very large catalog. */
export const MAX_ROWS = 50_000;

interface Page<T> {
  items: T[];
  hasNextPage: boolean;
  endCursor?: string | null;
}

/** Read every page of a connector query, up to {@link MAX_ROWS}. */
export async function readAll<T>(
  fetchPage: (after: string | null) => Promise<Page<T>>
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    rows.push(...page.items);
    if (!page.hasNextPage || !page.endCursor) return { rows, truncated: false };
    if (rows.length >= MAX_ROWS) return { rows: rows.slice(0, MAX_ROWS), truncated: true };
    cursor = page.endCursor;
  }
}

export interface LoadedDataset extends SimilarityDataset {
  truncated: boolean;
}

export async function loadSimilarityDataset(): Promise<LoadedDataset> {
  const client = await getRayfinClient();
  const lake = client.connectors.similaritylakehouse;

  const pairColumns = [
    'modelIdA', 'modelA', 'workspaceA', 'modelIdB', 'modelB', 'workspaceB', 'crossWorkspace',
    'jaccardTables', 'jaccardColumns', 'jaccardMeasureNames', 'jaccardRelationships', 'jaccardDatasources',
    'daxEmbeddingCosine', 'containmentRelationship', 'modelAInModelB', 'modelBInModelA', 'tier',
    'schemaScore', 'securityScore', 'combinedScore', 'scoreMode', 'securityComparisonStatus',
  ] as const;

  const [runs, models, signatures, pairs, clusters, reports, errors] = await Promise.all([
    lake.SemanticModelSimilarityRun.select([
      'analysisRunId', 'generatedAt', 'duplicateThreshold', 'similarThreshold', 'containmentThreshold',
      'enableBlocking', 'modelCount', 'pairCount', 'duplicateCount', 'similarCount', 'unassessedCount',
      'containmentCount', 'clusterCount',
    ])
      .first(1)
      .execute(),
    readAll((after) => {
      const query = lake.SemanticModels.select(['modelId', 'modelName', 'workspaceName']).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
    readAll((after) => {
      const query = lake.SemanticModelSignatures.select([
        'modelId', 'modelName', 'workspaceName', 'tableCount', 'columnCount', 'measureCount',
        'relationshipCount', 'datasourceCount', 'roleCount', 'securityScanStatus',
      ]).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
    readAll((after) => {
      const query = lake.SemanticModelSimilarityPairs.select([...pairColumns]).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
    readAll((after) => {
      const query = lake.SemanticModelDuplicateClusters.select(['clusterId', 'modelId', 'modelName', 'workspaceName']).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
    readAll((after) => {
      const query = lake.SemanticModelReportDependencies.select([
        'modelId', 'reportName', 'reportWorkspaceName', 'reportUrl', 'isCrossWorkspace',
      ]).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
    readAll((after) => {
      const query = lake.SemanticModelCatalogErrors.select(['workspaceName', 'modelName', 'errorType', 'errorMessage']).first(PAGE_SIZE);
      return (after ? query.after(after) : query).executePaginated();
    }),
  ]);

  const dataset = buildDataset({
    run: toRunSummary(runs[0]),
    models: models.rows as RawModel[],
    signatures: signatures.rows as RawSignature[],
    pairs: pairs.rows as RawPair[],
    clusters: clusters.rows as RawCluster[],
    reports: reports.rows as RawReport[],
    errors: errors.rows as RawCatalogError[],
  });
  const truncated = [models, signatures, pairs, clusters, reports, errors].some((result) => result.truncated);
  return { ...dataset, truncated };
}
