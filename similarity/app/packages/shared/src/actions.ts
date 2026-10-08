/**
 * Browser-safe record contracts for the app's Rayfin data entities (`packages/data/src`).
 * Keep each shape aligned with its decorated entity; never import the decorated classes here.
 */

export interface TrustedModelDecisionRecord {
  id: string;
  groupKey: string;
  modelId: string;
  modelName: string;
  workspaceId: string;
  workspaceName: string;
  rationale?: string;
  authorEmail: string;
  createdAt: Date;
}

export type RebindActionKind = 'planned' | 'executed' | 'failed' | 'undone' | 'undo_failed';

export interface RebindActionRecord {
  id: string;
  kind: RebindActionKind;
  planId?: string;
  reportId: string;
  reportName: string;
  reportWorkspaceId: string;
  reportWorkspaceName: string;
  fromModelId: string;
  fromModelName: string;
  toModelId: string;
  toModelName: string;
  coverage?: number;
  coverageOverride: boolean;
  message?: string;
  authorEmail: string;
  createdAt: Date;
}

/** The approver allow-list. The UI compares it with the signed-in email to show controls; enforcement is server-side. */
export interface ApproverList {
  approvers: string[];
}

export type RebindErrorCode =
  | 'invalid_plan'
  | 'not_approved'
  | 'not_found'
  | 'wrong_binding'
  | 'unsupported_report'
  | 'permission_denied'
  | 'rate_limited'
  | 'fabric_error';

/** Result of executing or undoing an approved rebind plan as the app identity. */
export interface RebindResult {
  status: 'rebound' | 'already_bound' | 'failed';
  /** Model the report was bound to before this call (from Power BI, not the plan). */
  previousModelId: string | null;
  error: { code: RebindErrorCode; message: string } | null;
}
