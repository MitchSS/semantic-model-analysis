import type { RebindActionRecord } from '@rayfin-app/shared';

import { validScore, type Results } from '@/lib/results/logic';

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Power BI model settings, where owners promote and authorized certifiers certify. */
export const modelSettingsUrl = (workspaceId: string, modelId: string) =>
  `https://app.powerbi.com/groups/${encodeURIComponent(workspaceId)}/settings/datasets/${encodeURIComponent(modelId)}`;

/** PowerShell (MicrosoftPowerBIMgmt) an approver can run under their own identity instead of the app. */
export function rebindScript(plan: Pick<RebindActionRecord, 'reportId' | 'reportName' | 'reportWorkspaceId' | 'fromModelId' | 'toModelId'>): string {
  const url = `groups/${plan.reportWorkspaceId}/reports/${plan.reportId}/Rebind`;
  return [
    `# Rebind "${plan.reportName.replace(/"/g, "'")}" (requires the MicrosoftPowerBIMgmt module)`,
    'Connect-PowerBIServiceAccount',
    `Invoke-PowerBIRestMethod -Method Post -Url "${url}" -Body '{"datasetId":"${plan.toModelId}"}'`,
    '# Undo:',
    `# Invoke-PowerBIRestMethod -Method Post -Url "${url}" -Body '{"datasetId":"${plan.fromModelId}"}'`,
  ].join('\n');
}

/** Coverage of `sourceId` within `targetId`: how much of the report's current model the target holds. */
export function coverageWithin(results: Results, sourceId: string, targetId: string): number | null {
  const pair = results.pair(sourceId, targetId);
  if (!pair) return null;
  const value = pair.idA === sourceId ? pair.aInB : pair.bInA;
  return validScore(value) ? value : null;
}
