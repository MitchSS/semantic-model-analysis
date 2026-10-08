import { entity, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelSignatures extends Source({ schema: 'dbo', table: 'semantic_model_signatures', primaryKey: [] }) {
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'workspace_id', max: 8000 }) workspaceId?: string;
  @text({ optional: true, column: 'workspace_name', max: 8000 }) workspaceName?: string;
  @text({ optional: true, column: 'model_name', max: 8000 }) modelName?: string;
  @int({ optional: true, column: 'table_count' }) tableCount?: number;
  @int({ optional: true, column: 'column_count' }) columnCount?: number;
  @int({ optional: true, column: 'measure_count' }) measureCount?: number;
  @int({ optional: true, column: 'relationship_count' }) relationshipCount?: number;
  @int({ optional: true, column: 'datasource_count' }) datasourceCount?: number;
  @text({ optional: true, column: 'analysis_run_id', max: 8000 }) analysisRunId?: string;
  @text({ optional: true, column: 'security_scan_status', max: 8000 }) securityScanStatus?: string;
  @int({ optional: true, column: 'role_count' }) roleCount?: number;
  @int({ optional: true, column: 'rls_filter_count' }) rlsFilterCount?: number;
  @int({ optional: true, column: 'table_ols_count' }) tableOlsCount?: number;
  @int({ optional: true, column: 'column_ols_count' }) columnOlsCount?: number;
}
