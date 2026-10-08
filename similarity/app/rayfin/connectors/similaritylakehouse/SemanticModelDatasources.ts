import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelDatasources extends Source({ schema: 'dbo', table: 'semantic_model_datasources', primaryKey: [] }) {
  @text({ optional: true, column: 'workspace_id', max: 8000 }) workspaceId?: string;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'datasource_name', max: 8000 }) datasourceName?: string;
  @text({ optional: true, column: 'datasource_type', max: 8000 }) datasourceType?: string;
  @text({ optional: true, column: 'connection_string', max: 8000 }) connectionString?: string;
  @text({ optional: true, column: 'connection_details', max: 8000 }) connectionDetails?: string;
}
