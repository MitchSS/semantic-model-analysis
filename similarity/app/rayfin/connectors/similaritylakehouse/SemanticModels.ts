import { entity, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModels extends Source({ schema: 'dbo', table: 'semantic_models', primaryKey: [] }) {
  @text({ optional: true, column: 'workspace_id', max: 8000 }) workspaceId?: string;
  @text({ optional: true, column: 'workspace_name', max: 8000 }) workspaceName?: string;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'model_name', max: 8000 }) modelName?: string;
  @int({ optional: true, column: 'compatibility_level' }) compatibilityLevel?: number;
  @text({ optional: true, column: 'default_mode', max: 8000 }) defaultMode?: string;
  @text({ optional: true, column: 'catalog_scan_id', max: 8000 }) catalogScanId?: string;
}
