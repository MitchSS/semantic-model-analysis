import { entity, boolean, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelReportDependencies extends Source({ schema: 'dbo', table: 'semantic_model_report_dependencies', primaryKey: [] }) {
  @text({ optional: true, column: 'scan_id', max: 8000 }) scanId?: string;
  @text({ optional: true, column: 'scanned_at', max: 8000 }) scannedAt?: string;
  @text({ optional: true, column: 'report_workspace_id', max: 8000 }) reportWorkspaceId?: string;
  @text({ optional: true, column: 'report_workspace_name', max: 8000 }) reportWorkspaceName?: string;
  @text({ optional: true, column: 'report_id', max: 8000 }) reportId?: string;
  @text({ optional: true, column: 'report_name', max: 8000 }) reportName?: string;
  @text({ optional: true, column: 'report_type', max: 8000 }) reportType?: string;
  @text({ optional: true, column: 'report_url', max: 8000 }) reportUrl?: string;
  @text({ optional: true, column: 'model_id', max: 8000 }) modelId?: string;
  @text({ optional: true, column: 'model_workspace_id', max: 8000 }) modelWorkspaceId?: string;
  @text({ optional: true, column: 'model_workspace_name', max: 8000 }) modelWorkspaceName?: string;
  @text({ optional: true, column: 'model_name', max: 8000 }) modelName?: string;
  @text({ optional: true, column: 'binding_status', max: 8000 }) bindingStatus?: string;
  @boolean({ optional: true, column: 'is_cross_workspace' }) isCrossWorkspace?: boolean;
}
