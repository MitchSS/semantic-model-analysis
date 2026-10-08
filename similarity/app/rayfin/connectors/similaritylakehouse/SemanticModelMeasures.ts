import { entity, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelMeasures extends Source({ schema: 'dbo', table: 'semantic_model_measures', primaryKey: [] }) {
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'measure_name', max: 8000 }) measureName?: string;
  @text({ optional: true, max: 8000 }) expression?: string;
}
