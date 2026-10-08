import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelRelationships extends Source({ schema: 'dbo', table: 'semantic_model_relationships', primaryKey: [] }) {
  @text({ optional: true, column: 'workspace_id', max: 8000 }) workspaceId?: string;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'from_table', max: 8000 }) fromTable?: string;
  @text({ optional: true, column: 'from_column', max: 8000 }) fromColumn?: string;
  @text({ optional: true, column: 'to_table', max: 8000 }) toTable?: string;
  @text({ optional: true, column: 'to_column', max: 8000 }) toColumn?: string;
}
