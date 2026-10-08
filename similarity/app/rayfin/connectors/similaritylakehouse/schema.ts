// Source: similaritylakehouse (fabric-sqlanalytics)
import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { SemanticModelCatalogErrors } from './SemanticModelCatalogErrors.js';
import { SemanticModelColumns } from './SemanticModelColumns.js';
import { SemanticModelDatasources } from './SemanticModelDatasources.js';
import { SemanticModelDuplicateClusters } from './SemanticModelDuplicateClusters.js';
import { SemanticModelMeasures } from './SemanticModelMeasures.js';
import { SemanticModelQueries } from './SemanticModelQueries.js';
import { SemanticModelRelationships } from './SemanticModelRelationships.js';
import { SemanticModelReportDependencies } from './SemanticModelReportDependencies.js';
import { SemanticModelReportScan } from './SemanticModelReportScan.js';
import { SemanticModelSignatures } from './SemanticModelSignatures.js';
import { SemanticModelSimilarityPairs } from './SemanticModelSimilarityPairs.js';
import { SemanticModelSimilarityRun } from './SemanticModelSimilarityRun.js';
import { SemanticModelTables } from './SemanticModelTables.js';
import { SemanticModels } from './SemanticModels.js';

export { SemanticModelCatalogErrors } from './SemanticModelCatalogErrors.js';
export { SemanticModelColumns } from './SemanticModelColumns.js';
export { SemanticModelDatasources } from './SemanticModelDatasources.js';
export { SemanticModelDuplicateClusters } from './SemanticModelDuplicateClusters.js';
export { SemanticModelMeasures } from './SemanticModelMeasures.js';
export { SemanticModelQueries } from './SemanticModelQueries.js';
export { SemanticModelRelationships } from './SemanticModelRelationships.js';
export { SemanticModelReportDependencies } from './SemanticModelReportDependencies.js';
export { SemanticModelReportScan } from './SemanticModelReportScan.js';
export { SemanticModelSignatures } from './SemanticModelSignatures.js';
export { SemanticModelSimilarityPairs } from './SemanticModelSimilarityPairs.js';
export { SemanticModelSimilarityRun } from './SemanticModelSimilarityRun.js';
export { SemanticModelTables } from './SemanticModelTables.js';
export { SemanticModels } from './SemanticModels.js';

export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { SemanticModelCatalogErrors, SemanticModelColumns, SemanticModelDatasources, SemanticModelDuplicateClusters, SemanticModelMeasures, SemanticModelQueries, SemanticModelRelationships, SemanticModelReportDependencies, SemanticModelReportScan, SemanticModelSignatures, SemanticModelSimilarityPairs, SemanticModelSimilarityRun, SemanticModelTables, SemanticModels },
} as const satisfies ConnectorConfig;

export type SimilaritylakehouseSchema = GraphQLBackedConnector<
  {
    SemanticModelCatalogErrors: typeof SemanticModelCatalogErrors;
    SemanticModelColumns: typeof SemanticModelColumns;
    SemanticModelDatasources: typeof SemanticModelDatasources;
    SemanticModelDuplicateClusters: typeof SemanticModelDuplicateClusters;
    SemanticModelMeasures: typeof SemanticModelMeasures;
    SemanticModelQueries: typeof SemanticModelQueries;
    SemanticModelRelationships: typeof SemanticModelRelationships;
    SemanticModelReportDependencies: typeof SemanticModelReportDependencies;
    SemanticModelReportScan: typeof SemanticModelReportScan;
    SemanticModelSignatures: typeof SemanticModelSignatures;
    SemanticModelSimilarityPairs: typeof SemanticModelSimilarityPairs;
    SemanticModelSimilarityRun: typeof SemanticModelSimilarityRun;
    SemanticModelTables: typeof SemanticModelTables;
    SemanticModels: typeof SemanticModels;
  },
  typeof connectorConfig
>;
