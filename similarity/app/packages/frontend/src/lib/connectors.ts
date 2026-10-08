// #region rayfin:app-owned — copied verbatim by the Rayfin CLI; edit freely.
//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';

// Type-only: decorated entity classes must never be bundled into browser code.
import type {
  SemanticModelCatalogErrors,
  SemanticModelColumns,
  SemanticModelDatasources,
  SemanticModelDuplicateClusters,
  SemanticModelMeasures,
  SemanticModelQueries,
  SemanticModelRelationships,
  SemanticModelReportDependencies,
  SemanticModelReportScan,
  SemanticModels,
  SemanticModelSignatures,
  SemanticModelSimilarityPairs,
  SemanticModelSimilarityRun,
  SemanticModelTables,
  SimilaritylakehouseSchema,
} from '../../../../rayfin/connectors/similaritylakehouse/schema';
// #endregion rayfin:app-owned

type FieldsOf<E> = E extends abstract new (...args: never[]) => infer I ? Extract<keyof I, string> : never;

/**
 * Column list for an entity, checked at compile time to name every field of the
 * entity class exactly once, so it cannot drift from 'rayfin/connectors/'.
 */
const columnsOf =
  <E>() =>
  <const C extends readonly FieldsOf<E>[]>(
    columns: C & ([Exclude<FieldsOf<E>, C[number]>] extends [never] ? unknown : { missing: Exclude<FieldsOf<E>, C[number]> })
  ): C =>
    columns;

const similaritylakehouseConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: {
    SemanticModelCatalogErrors: columnsOf<typeof SemanticModelCatalogErrors>()([
      'workspaceId', 'workspaceName', 'modelId', 'modelName', 'errorType', 'errorMessage',
    ]),
    SemanticModelColumns: columnsOf<typeof SemanticModelColumns>()([
      'workspaceId', 'modelId', 'tableName', 'columnName',
    ]),
    SemanticModelDatasources: columnsOf<typeof SemanticModelDatasources>()([
      'workspaceId', 'modelId', 'datasourceName', 'datasourceType', 'connectionString', 'connectionDetails',
    ]),
    SemanticModelDuplicateClusters: columnsOf<typeof SemanticModelDuplicateClusters>()([
      'clusterId', 'clusterSize', 'modelId', 'model', 'workspaceName', 'modelName', 'analysisRunId', 'scoreVersion',
    ]),
    SemanticModelMeasures: columnsOf<typeof SemanticModelMeasures>()([
      'workspaceId', 'modelId', 'measureName', 'expression',
    ]),
    SemanticModelQueries: columnsOf<typeof SemanticModelQueries>()([
      'workspaceId', 'modelId', 'tableName', 'partitionName', 'queryKind', 'sourceType', 'expression', 'expressionHash',
    ]),
    SemanticModelRelationships: columnsOf<typeof SemanticModelRelationships>()([
      'workspaceId', 'modelId', 'fromTable', 'fromColumn', 'toTable', 'toColumn',
    ]),
    SemanticModelReportDependencies: columnsOf<typeof SemanticModelReportDependencies>()([
      'scanId', 'scannedAt', 'reportWorkspaceId', 'reportWorkspaceName', 'reportId', 'reportName', 'reportType', 'reportUrl', 'modelId', 'modelWorkspaceId', 'modelWorkspaceName', 'modelName', 'bindingStatus', 'isCrossWorkspace',
    ]),
    SemanticModelReportScan: columnsOf<typeof SemanticModelReportScan>()([
      'scanId', 'scannedAt', 'reportWorkspaceId', 'reportWorkspaceName', 'scanStatus', 'reportCount', 'boundReportCount', 'unresolvedReportCount', 'unsupportedReportCount', 'errorType', 'scanScope',
    ]),
    SemanticModels: columnsOf<typeof SemanticModels>()([
      'workspaceId', 'workspaceName', 'modelId', 'modelName', 'compatibilityLevel', 'defaultMode', 'catalogScanId',
    ]),
    SemanticModelSignatures: columnsOf<typeof SemanticModelSignatures>()([
      'modelId', 'workspaceId', 'workspaceName', 'modelName', 'tableCount', 'columnCount', 'measureCount', 'relationshipCount', 'datasourceCount', 'analysisRunId', 'catalogScanId', 'scoreVersion', 'securityScanStatus', 'securityFingerprint', 'roleCount', 'rlsFilterCount', 'tableOlsCount', 'columnOlsCount', 'queryCount',
    ]),
    SemanticModelSimilarityPairs: columnsOf<typeof SemanticModelSimilarityPairs>()([
      'modelIdA', 'modelA', 'workspaceA', 'modelIdB', 'modelB', 'workspaceB', 'sameModelName', 'crossWorkspace', 'jaccardTables', 'jaccardColumns', 'jaccardMeasureNames', 'jaccardRelationships', 'jaccardDatasources', 'daxEmbeddingCosine', 'compositeScore', 'containmentScore', 'containmentRelationship', 'modelAInModelB', 'modelBInModelA', 'tier', 'schemaScore', 'securityScore', 'combinedScore', 'scoreMode', 'securityComparisonStatus', 'securityEvidenceJson', 'securityFingerprintA', 'securityFingerprintB', 'catalogScanIdA', 'catalogScanIdB', 'analysisRunId', 'scoreVersion', 'powerQuerySimilarity', 'powerQueryStatus', 'sharedQueryCount',
    ]),
    SemanticModelSimilarityRun: columnsOf<typeof SemanticModelSimilarityRun>()([
      'generatedAt', 'analysisRunId', 'catalogScanId', 'scoreVersion', 'duplicateThreshold', 'similarThreshold', 'containmentThreshold', 'enableBlocking', 'combinedWeightsJson', 'modelCount', 'pairCount', 'duplicateCount', 'similarCount', 'unassessedCount', 'containmentCount', 'clusterCount',
    ]),
    SemanticModelTables: columnsOf<typeof SemanticModelTables>()([
      'workspaceId', 'modelId', 'tableName',
    ]),
  },
} as const satisfies ConnectorConfig;

export type AppConnectorsSchema = {
  similaritylakehouse: SimilaritylakehouseSchema;
};

export const connectorConfigs = {
  similaritylakehouse: similaritylakehouseConfig,
} satisfies Record<string, ConnectorConfig>;

export const connectorRuntimes: ConnectorsRuntime = {};