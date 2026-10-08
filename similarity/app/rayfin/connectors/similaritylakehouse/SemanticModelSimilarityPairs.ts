import { entity, boolean, decimal, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelSimilarityPairs extends Source({ schema: 'dbo', table: 'semantic_model_similarity_pairs', primaryKey: [] }) {
  @text({ optional: true, column: 'model_id_a', max: 8000 }) modelIdA?: string;
  @text({ optional: true, column: 'model_a', max: 8000 }) modelA?: string;
  @text({ optional: true, column: 'workspace_a', max: 8000 }) workspaceA?: string;
  @text({ optional: true, column: 'model_id_b', max: 8000 }) modelIdB?: string;
  @text({ optional: true, column: 'model_b', max: 8000 }) modelB?: string;
  @text({ optional: true, column: 'workspace_b', max: 8000 }) workspaceB?: string;
  @boolean({ optional: true, column: 'same_model_name' }) sameModelName?: boolean;
  @boolean({ optional: true, column: 'cross_workspace' }) crossWorkspace?: boolean;
  @decimal({ optional: true, column: 'jaccard_tables' }) jaccardTables?: number;
  @decimal({ optional: true, column: 'jaccard_columns' }) jaccardColumns?: number;
  @decimal({ optional: true, column: 'jaccard_measure_names' }) jaccardMeasureNames?: number;
  @decimal({ optional: true, column: 'jaccard_relationships' }) jaccardRelationships?: number;
  @decimal({ optional: true, column: 'jaccard_datasources' }) jaccardDatasources?: number;
  @decimal({ optional: true, column: 'dax_embedding_cosine' }) daxEmbeddingCosine?: number;
  @decimal({ optional: true, column: 'composite_score' }) compositeScore?: number;
  @decimal({ optional: true, column: 'containment_score' }) containmentScore?: number;
  @text({ optional: true, column: 'containment_relationship', max: 8000 }) containmentRelationship?: string;
  @decimal({ optional: true, column: 'model_a_in_model_b' }) modelAInModelB?: number;
  @decimal({ optional: true, column: 'model_b_in_model_a' }) modelBInModelA?: number;
  @text({ optional: true, max: 8000 }) tier?: string;
  @decimal({ optional: true, column: 'schema_score' }) schemaScore?: number;
  @decimal({ optional: true, column: 'security_score' }) securityScore?: number;
  @decimal({ optional: true, column: 'combined_score' }) combinedScore?: number;
  @text({ optional: true, column: 'score_mode', max: 8000 }) scoreMode?: string;
  @text({ optional: true, column: 'security_comparison_status', max: 8000 }) securityComparisonStatus?: string;
  @text({ optional: true, column: 'security_evidence_json', max: 8000 }) securityEvidenceJson?: string;
  @text({ optional: true, column: 'security_fingerprint_a', max: 8000 }) securityFingerprintA?: string;
  @text({ optional: true, column: 'security_fingerprint_b', max: 8000 }) securityFingerprintB?: string;
  @text({ optional: true, column: 'catalog_scan_id_a', max: 8000 }) catalogScanIdA?: string;
  @text({ optional: true, column: 'catalog_scan_id_b', max: 8000 }) catalogScanIdB?: string;
  @text({ optional: true, column: 'analysis_run_id', max: 8000 }) analysisRunId?: string;
  @int({ optional: true, column: 'score_version' }) scoreVersion?: number;
  @decimal({ optional: true, column: 'power_query_similarity' }) powerQuerySimilarity?: number;
  @text({ optional: true, column: 'power_query_status', max: 8000 }) powerQueryStatus?: string;
  @int({ optional: true, column: 'shared_query_count' }) sharedQueryCount?: number;
}
