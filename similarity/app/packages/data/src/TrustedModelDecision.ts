import { date, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Append-only log of trusted-model decisions for a duplicate group.
 *
 * `authorEmail` must equal the caller's `email` claim (server-side create policy), so a row
 * cannot be written on someone else's behalf. A decision by an address in the app's approver
 * allow-list is an approval; any other author's row is a proposal. No update or delete.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.email.eq(item.authorEmail),
})
export class TrustedModelDecision {
  @uuid() id!: string;
  @text({ max: 4000 }) groupKey!: string;
  @text({ max: 64 }) modelId!: string;
  @text({ max: 400 }) modelName!: string;
  @text({ max: 64 }) workspaceId!: string;
  @text({ max: 400 }) workspaceName!: string;
  @text({ optional: true, max: 2000 }) rationale?: string;
  @text({ max: 320 }) authorEmail!: string;
  @date() createdAt!: Date;
}
