import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelColumns extends Source({ schema: 'dbo', table: 'semantic_model_columns', primaryKey: [] }) {
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'table_name', max: 8000 }) tableName?: string;
  @text({ optional: true, column: 'column_name', max: 8000 }) columnName?: string;
}
