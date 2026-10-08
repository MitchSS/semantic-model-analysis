import { buildDataset, type RawPair } from '@/lib/similarity-model';

export const MODEL_IDS = {
  salesA: '00000000-0000-4000-8000-00000000000a',
  salesB: '00000000-0000-4000-8000-00000000000b',
  finance: '00000000-0000-4000-8000-00000000000c',
  hr: '00000000-0000-4000-8000-00000000000d',
};

const pair = (overrides: RawPair): RawPair => ({
  crossWorkspace: false,
  jaccardTables: 1,
  jaccardColumns: 0.9,
  jaccardMeasureNames: 0.8,
  jaccardRelationships: 1,
  jaccardDatasources: 1,
  daxEmbeddingCosine: 0.95,
  containmentRelationship: 'partial_overlap',
  modelAInModelB: 0.6,
  modelBInModelA: 0.5,
  tier: 'similar',
  schemaScore: 0.8,
  securityScore: null,
  combinedScore: 0.8,
  scoreMode: 'schema_only_no_security',
  securityComparisonStatus: 'not_applicable',
  ...overrides,
});

export function fixtureDataset() {
  return {
    ...buildDataset({
      run: {
        analysisRunId: 'run-1',
        generatedAt: '2026-10-01T09:00:00Z',
        duplicateThreshold: 0.95,
        similarThreshold: 0.7,
        containmentThreshold: 0.95,
        enableBlocking: true,
        modelCount: 4,
        pairCount: 3,
        duplicateCount: 1,
        similarCount: 1,
        unassessedCount: 0,
        containmentCount: 1,
        clusterCount: 1,
      },
      models: [
        { modelId: MODEL_IDS.salesA, modelName: 'Sales', workspaceName: 'Commercial' },
        { modelId: MODEL_IDS.salesB, modelName: 'Sales Copy', workspaceName: 'Sandbox' },
        { modelId: MODEL_IDS.finance, modelName: 'Finance', workspaceName: 'Commercial' },
        { modelId: MODEL_IDS.hr, modelName: 'People', workspaceName: 'HR' },
      ],
      signatures: [{ modelId: MODEL_IDS.salesA, tableCount: 12, measureCount: 40 }],
      pairs: [
        pair({
          modelIdA: MODEL_IDS.salesA, modelA: 'Commercial / Sales', workspaceA: 'Commercial',
          modelIdB: MODEL_IDS.salesB, modelB: 'Sandbox / Sales Copy', workspaceB: 'Sandbox',
          crossWorkspace: true, tier: 'duplicate', combinedScore: 0.97, schemaScore: 0.99, securityScore: 0.5,
          securityComparisonStatus: 'different', scoreMode: 'combined',
        }),
        pair({
          modelIdA: MODEL_IDS.salesA, modelA: 'Commercial / Sales', workspaceA: 'Commercial',
          modelIdB: MODEL_IDS.finance, modelB: 'Commercial / Finance', workspaceB: 'Commercial',
          tier: 'distinct', combinedScore: 0.4, containmentRelationship: 'model_b_contains_model_a',
          modelAInModelB: 0.97,
        }),
        pair({
          modelIdA: MODEL_IDS.finance, modelA: 'Commercial / Finance', workspaceA: 'Commercial',
          modelIdB: MODEL_IDS.hr, modelB: 'HR / People', workspaceB: 'HR', crossWorkspace: true,
        }),
      ],
      clusters: [
        { clusterId: 1, modelId: MODEL_IDS.salesA, modelName: 'Sales', workspaceName: 'Commercial' },
        { clusterId: 1, modelId: MODEL_IDS.salesB, modelName: 'Sales Copy', workspaceName: 'Sandbox' },
      ],
      reports: [
        { modelId: MODEL_IDS.salesA, reportName: 'Pipeline', reportWorkspaceName: 'Commercial', reportUrl: 'https://app.powerbi.com/groups/x/reports/y' },
        { modelId: MODEL_IDS.salesA, reportName: 'Bad link', reportWorkspaceName: 'Commercial', reportUrl: 'javascript:alert(1)' },
      ],
      errors: [{ workspaceName: 'Locked', modelName: 'Secret', errorType: 'Forbidden', errorMessage: '' }],
    }),
    truncated: false,
  };
}
