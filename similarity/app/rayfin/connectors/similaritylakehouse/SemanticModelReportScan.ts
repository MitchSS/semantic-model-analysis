import { entity, int, text, role } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class SemanticModelReportScan extends Source({ schema: 'dbo', table: 'semantic_model_report_scan', primaryKey: [] }) {
  @text({ optional: true, column: 'scan_id', max: 8000 }) scanId?: string;
  @text({ optional: true, column: 'scanned_at', max: 8000 }) scannedAt?: string;
  @text({ optional: true, column: 'report_workspace_id', max: 8000 }) reportWorkspaceId?: string;
  @text({ optional: true, column: 'report_workspace_name', max: 8000 }) reportWorkspaceName?: string;
  @text({ optional: true, column: 'scan_status', max: 8000 }) scanStatus?: string;
  @int({ optional: true, column: 'report_count' }) reportCount?: number;
  @int({ optional: true, column: 'bound_report_count' }) boundReportCount?: number;
  @int({ optional: true, column: 'unresolved_report_count' }) unresolvedReportCount?: number;
  @int({ optional: true, column: 'unsupported_report_count' }) unsupportedReportCount?: number;
  @text({ optional: true, column: 'error_type', max: 8000 }) errorType?: string;
  @text({ optional: true, column: 'scan_scope', max: 8000 }) scanScope?: string;
}
