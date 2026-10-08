import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelQueries extends Source({ schema: 'dbo', table: 'semantic_model_queries', primaryKey: [] }) {
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'table_name', max: 8000 }) tableName?: string;
  @text({ optional: true, column: 'partition_name', max: 8000 }) partitionName?: string;
  @text({ optional: true, column: 'query_kind', max: 8000 }) queryKind?: string;
  @text({ optional: true, column: 'source_type', max: 8000 }) sourceType?: string;
  @text({ optional: true, max: 8000 }) expression?: string;
  @text({ optional: true, column: 'expression_hash', max: 8000 }) expressionHash?: string;
}
