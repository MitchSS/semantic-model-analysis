import { entity, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelDuplicateClusters extends Source({ schema: 'dbo', table: 'semantic_model_duplicate_clusters', primaryKey: [] }) {
  @int({ optional: true, column: 'cluster_id' }) clusterId?: number;
  @int({ optional: true, column: 'cluster_size' }) clusterSize?: number;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, max: 8000 }) model?: string;
  @text({ optional: true, column: 'workspace_name', max: 8000 }) workspaceName?: string;
  @text({ optional: true, column: 'model_name', max: 8000 }) modelName?: string;
  @text({ optional: true, column: 'analysis_run_id', max: 8000 }) analysisRunId?: string;
  @int({ optional: true, column: 'score_version' }) scoreVersion?: number;
}
