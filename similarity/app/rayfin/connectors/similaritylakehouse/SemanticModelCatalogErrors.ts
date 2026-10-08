import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelCatalogErrors extends Source({ schema: 'dbo', table: 'semantic_model_catalog_errors', primaryKey: [] }) {
  @text({ optional: true, column: 'workspace_id', max: 8000 }) workspaceId?: string;
  @text({ optional: true, column: 'workspace_name', max: 8000 }) workspaceName?: string;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'model_name', max: 8000 }) modelName?: string;
  @text({ optional: true, column: 'error_type', max: 8000 }) errorType?: string;
  @text({ optional: true, column: 'error_message', max: 8000 }) errorMessage?: string;
}
