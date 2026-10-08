// Source: similaritylakehouse (fabric-sqlanalytics)
import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { SemanticModelCatalogErrors } from './SemanticModelCatalogErrors.js';
import { SemanticModelDuplicateClusters } from './SemanticModelDuplicateClusters.js';
import { SemanticModelReportDependencies } from './SemanticModelReportDependencies.js';
import { SemanticModelSignatures } from './SemanticModelSignatures.js';
import { SemanticModelSimilarityPairs } from './SemanticModelSimilarityPairs.js';
import { SemanticModelSimilarityRun } from './SemanticModelSimilarityRun.js';
import { SemanticModels } from './SemanticModels.js';

export { SemanticModelCatalogErrors } from './SemanticModelCatalogErrors.js';
export { SemanticModelDuplicateClusters } from './SemanticModelDuplicateClusters.js';
export { SemanticModelReportDependencies } from './SemanticModelReportDependencies.js';
export { SemanticModelSignatures } from './SemanticModelSignatures.js';
export { SemanticModelSimilarityPairs } from './SemanticModelSimilarityPairs.js';
export { SemanticModelSimilarityRun } from './SemanticModelSimilarityRun.js';
export { SemanticModels } from './SemanticModels.js';

export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { SemanticModelCatalogErrors, SemanticModelDuplicateClusters, SemanticModelReportDependencies, SemanticModelSignatures, SemanticModelSimilarityPairs, SemanticModelSimilarityRun, SemanticModels },
} as const satisfies ConnectorConfig;

export type SimilaritylakehouseSchema = GraphQLBackedConnector<
  {
    SemanticModelCatalogErrors: typeof SemanticModelCatalogErrors;
    SemanticModelDuplicateClusters: typeof SemanticModelDuplicateClusters;
    SemanticModelReportDependencies: typeof SemanticModelReportDependencies;
    SemanticModelSignatures: typeof SemanticModelSignatures;
    SemanticModelSimilarityPairs: typeof SemanticModelSimilarityPairs;
    SemanticModelSimilarityRun: typeof SemanticModelSimilarityRun;
    SemanticModels: typeof SemanticModels;
  },
  typeof connectorConfig
>;
