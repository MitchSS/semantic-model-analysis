import { entity, boolean, decimal, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelSimilarityRun extends Source({ schema: 'dbo', table: 'semantic_model_similarity_run', primaryKey: [] }) {
  @text({ optional: true, column: 'generated_at', max: 8000 }) generatedAt?: string;
  @text({ optional: true, column: 'analysis_run_id', max: 8000 }) analysisRunId?: string;
  @text({ optional: true, column: 'catalog_scan_id', max: 8000 }) catalogScanId?: string;
  @int({ optional: true, column: 'score_version' }) scoreVersion?: number;
  @decimal({ optional: true, column: 'duplicate_threshold' }) duplicateThreshold?: number;
  @decimal({ optional: true, column: 'similar_threshold' }) similarThreshold?: number;
  @decimal({ optional: true, column: 'containment_threshold' }) containmentThreshold?: number;
  @boolean({ optional: true, column: 'enable_blocking' }) enableBlocking?: boolean;
  @text({ optional: true, column: 'combined_weights_json', max: 8000 }) combinedWeightsJson?: string;
  @int({ optional: true, column: 'model_count' }) modelCount?: number;
  @int({ optional: true, column: 'pair_count' }) pairCount?: number;
  @int({ optional: true, column: 'duplicate_count' }) duplicateCount?: number;
  @int({ optional: true, column: 'similar_count' }) similarCount?: number;
  @int({ optional: true, column: 'unassessed_count' }) unassessedCount?: number;
  @int({ optional: true, column: 'containment_count' }) containmentCount?: number;
  @int({ optional: true, column: 'cluster_count' }) clusterCount?: number;
}
