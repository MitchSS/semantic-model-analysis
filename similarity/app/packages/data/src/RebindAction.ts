import { boolean, date, decimal, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Append-only log for report rebinds.
 *
 * A `planned` row describes one report move (from → to). It is approved when its author is in the
 * approver allow-list; `executeRebind` refuses any other plan. Outcome rows (`executed`, `failed`,
 * `undone`, `undo_failed`) reference the plan by `planId` and record who ran it. `authorEmail` must
 * equal the caller's `email` claim (server-side create policy). No update or delete.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.email.eq(item.authorEmail),
})
export class RebindAction {
  @uuid() id!: string;
  @set('planned', 'executed', 'failed', 'undone', 'undo_failed') kind!: 'planned' | 'executed' | 'failed' | 'undone' | 'undo_failed';
  @text({ optional: true, max: 64 }) planId?: string;
  @text({ max: 64 }) reportId!: string;
  @text({ max: 400 }) reportName!: string;
  @text({ max: 64 }) reportWorkspaceId!: string;
  @text({ max: 400 }) reportWorkspaceName!: string;
  @text({ max: 64 }) fromModelId!: string;
  @text({ max: 400 }) fromModelName!: string;
  @text({ max: 64 }) toModelId!: string;
  @text({ max: 400 }) toModelName!: string;
  @decimal({ optional: true }) coverage?: number;
  @boolean({ default: false }) coverageOverride!: boolean;
  @text({ optional: true, max: 1000 }) message?: string;
  @text({ max: 320 }) authorEmail!: string;
  @date() createdAt!: Date;
}
