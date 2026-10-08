import type { RebindActionRecord, TrustedModelDecisionRecord } from '@rayfin-app/shared';

import { validScore, type Candidate, type Results, type ViewState } from '@/lib/results/logic';
import type { PayloadPair, ReportEntry } from '@/lib/results/payload';

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

/** Decision context for trust chosen in the Consolidation workspace (stored in `groupKey`). */
export const modelContextKey = (modelId: string) => `model:${modelId}`;

/** Models whose trust was decided by an approver, in any context (group or model). */
export function trustedModelIds(decisions: Pick<TrustedModelDecisionRecord, 'modelId' | 'authorEmail'>[], approvers: Set<string>): Set<string> {
  return new Set(decisions.filter((decision) => approvers.has(decision.authorEmail.toLowerCase())).map((decision) => decision.modelId));
}

export interface ConsolidationCandidate {
  id: string;
  pair: PayloadPair;
  category: Candidate['category'];
  /** How much of the candidate the target already holds (directional schema coverage). */
  coverage: number | null;
  reports: ReportEntry[];
}

/** Review candidates (same thresholds and scope as Review) that involve `targetId`, best first. */
export function consolidationCandidates(results: Results, state: Pick<ViewState, 'thresholds' | 'crossOnly'>, targetId: string): ConsolidationCandidate[] {
  return results
    .candidates(state)
    .filter(({ pair }) => pair.idA === targetId || pair.idB === targetId)
    .map(({ pair, category }) => {
      const id = pair.idA === targetId ? pair.idB : pair.idA;
      return { id, pair, category, coverage: coverageWithin(results, id, targetId), reports: results.reportsFor(id) };
    })
    .sort((a, b) => a.category.rank - b.category.rank || (b.coverage ?? -1) - (a.coverage ?? -1) || a.id.localeCompare(b.id));
}

export interface TargetSuggestion {
  id: string;
  trusted: boolean;
  candidates: number;
  reports: number;
}

/** Every catalog model as a possible target: trusted first, then most candidates, then most reports to move. */
export function suggestedTargets(results: Results, state: Pick<ViewState, 'thresholds' | 'crossOnly'>, trusted: Set<string>): TargetSuggestion[] {
  const stats = new Map<string, { candidates: number; reports: number }>();
  for (const { pair } of results.candidates(state)) {
    for (const [self, other] of [
      [pair.idA, pair.idB],
      [pair.idB, pair.idA],
    ]) {
      const entry = stats.get(self) ?? { candidates: 0, reports: 0 };
      entry.candidates += 1;
      entry.reports += results.reportsFor(other).length;
      stats.set(self, entry);
    }
  }
  return results.modelList
    .map((entry) => ({ id: entry.id, trusted: trusted.has(entry.id), ...(stats.get(entry.id) ?? { candidates: 0, reports: 0 }) }))
    .sort(
      (a, b) =>
        Number(b.trusted) - Number(a.trusted) ||
        b.candidates - a.candidates ||
        b.reports - a.reports ||
        results.model(a.id).name.localeCompare(results.model(b.id).name) ||
        a.id.localeCompare(b.id)
    );
}

/** Default consolidation target for a pair: a trusted side, else the side the other is most contained in, else B. */
export function defaultTargetForPair(results: Results, state: Pick<ViewState, 'thresholds'>, a: string, b: string, trusted: Set<string>): string {
  if (trusted.has(a) !== trusted.has(b)) return trusted.has(a) ? a : b;
  const strongest = results.coverageContext(state, results.pair(a, b)).strongest;
  return strongest ? strongest.targetId : b;
}
