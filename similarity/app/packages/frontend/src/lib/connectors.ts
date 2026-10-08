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
  SemanticModelDuplicateClusters,
  SemanticModelReportDependencies,
  SemanticModelSignatures,
  SemanticModelSimilarityPairs,
  SemanticModelSimilarityRun,
  SemanticModels,
  SimilaritylakehouseSchema,
} from '../../../../rayfin/connectors/similaritylakehouse/schema';
// #endregion rayfin:app-owned

type FieldsOf<E> = E extends abstract new (...args: never[]) => infer I ? Extract<keyof I, string> : never;

/**
 * Column list for an entity, checked at compile time to name every field of the
 * entity class exactly once, so it cannot drift from `rayfin/connectors/`.
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
    SemanticModelDuplicateClusters: columnsOf<typeof SemanticModelDuplicateClusters>()([
      'clusterId', 'clusterSize', 'modelId', 'model', 'workspaceName', 'modelName', 'analysisRunId', 'scoreVersion',
    ]),
    SemanticModelReportDependencies: columnsOf<typeof SemanticModelReportDependencies>()([
      'scanId', 'scannedAt', 'reportWorkspaceId', 'reportWorkspaceName', 'reportId', 'reportName', 'reportType',
      'reportUrl', 'modelId', 'modelWorkspaceId', 'modelWorkspaceName', 'modelName', 'bindingStatus', 'isCrossWorkspace',
    ]),
    SemanticModelSignatures: columnsOf<typeof SemanticModelSignatures>()([
      'modelId', 'workspaceId', 'workspaceName', 'modelName', 'tableCount', 'columnCount', 'measureCount',
      'relationshipCount', 'datasourceCount', 'analysisRunId', 'securityScanStatus', 'roleCount', 'rlsFilterCount',
      'tableOlsCount', 'columnOlsCount',
    ]),
    SemanticModelSimilarityPairs: columnsOf<typeof SemanticModelSimilarityPairs>()([
      'modelIdA', 'modelA', 'workspaceA', 'modelIdB', 'modelB', 'workspaceB', 'sameModelName', 'crossWorkspace',
      'jaccardTables', 'jaccardColumns', 'jaccardMeasureNames', 'jaccardRelationships', 'jaccardDatasources',
      'daxEmbeddingCosine', 'compositeScore', 'containmentScore', 'containmentRelationship', 'modelAInModelB',
      'modelBInModelA', 'tier', 'schemaScore', 'securityScore', 'combinedScore', 'scoreMode',
      'securityComparisonStatus', 'analysisRunId',
    ]),
    SemanticModelSimilarityRun: columnsOf<typeof SemanticModelSimilarityRun>()([
      'generatedAt', 'analysisRunId', 'catalogScanId', 'scoreVersion', 'duplicateThreshold', 'similarThreshold',
      'containmentThreshold', 'enableBlocking', 'modelCount', 'pairCount', 'duplicateCount', 'similarCount',
      'unassessedCount', 'containmentCount', 'clusterCount',
    ]),
    SemanticModels: columnsOf<typeof SemanticModels>()([
      'workspaceId', 'workspaceName', 'modelId', 'modelName', 'compatibilityLevel', 'defaultMode', 'catalogScanId',
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
