import type { RebindActionRecord, RebindResult, TrustedModelDecisionRecord } from '@rayfin-app/shared';
import { useCallback, useEffect, useState } from 'react';

import { getRayfinClient } from '@/lib/rayfin-client';

const LOG_LIMIT = 1000;

export type NewDecision = Omit<TrustedModelDecisionRecord, 'id' | 'authorEmail' | 'createdAt'>;
export type NewRebindPlan = Omit<RebindActionRecord, 'id' | 'kind' | 'planId' | 'authorEmail' | 'createdAt' | 'message'>;

export interface ActionsApi {
  sessionEmail(): Promise<string | null>;
  approvers(): Promise<string[]>;
  decisions(): Promise<TrustedModelDecisionRecord[]>;
  rebindLog(): Promise<RebindActionRecord[]>;
  createDecision(row: TrustedModelDecisionRecord): Promise<void>;
  createRebind(row: RebindActionRecord): Promise<{ id: string }>;
  execute(planId: string): Promise<RebindResult>;
  undo(planId: string): Promise<RebindResult>;
}

const DECISION_FIELDS = ['id', 'groupKey', 'modelId', 'modelName', 'workspaceId', 'workspaceName', 'rationale', 'authorEmail', 'createdAt'] as const;
const REBIND_FIELDS = [
  'id', 'kind', 'planId', 'reportId', 'reportName', 'reportWorkspaceId', 'reportWorkspaceName', 'fromModelId', 'fromModelName',
  'toModelId', 'toModelName', 'coverage', 'coverageOverride', 'message', 'authorEmail', 'createdAt',
] as const;

export const functionsActionsApi: ActionsApi = {
  async sessionEmail() {
    const session = (await getRayfinClient()).auth.getSession();
    return session?.isAuthenticated && session.user?.email ? session.user.email : null;
  },
  async approvers() {
    return (await (await getRayfinClient()).functions.listApprovers.invoke()).approvers;
  },
  async decisions() {
    const page = await (await getRayfinClient()).data.TrustedModelDecision.select([...DECISION_FIELDS]).orderBy({ createdAt: 'desc' }).first(LOG_LIMIT).executePaginated();
    return page.items as TrustedModelDecisionRecord[];
  },
  async rebindLog() {
    const page = await (await getRayfinClient()).data.RebindAction.select([...REBIND_FIELDS]).orderBy({ createdAt: 'desc' }).first(LOG_LIMIT).executePaginated();
    return page.items as RebindActionRecord[];
  },
  async createDecision(row) {
    await (await getRayfinClient()).data.TrustedModelDecision.create(row);
  },
  async createRebind(row) {
    const created = await (await getRayfinClient()).data.RebindAction.create(row);
    return { id: String((created as { id?: string }).id ?? row.id) };
  },
  async execute(planId) {
    return (await getRayfinClient()).functions.executeRebind.invoke({ planId });
  },
  async undo(planId) {
    return (await getRayfinClient()).functions.undoRebind.invoke({ planId });
  },
};

const newId = () => crypto.randomUUID();
const time = (value: Date | string) => new Date(value).getTime();

/** Latest decision by an approver among `memberIds`, else null. Decisions are append-only. */
export function trustedModelFor(decisions: TrustedModelDecisionRecord[], memberIds: string[], approvers: Set<string>) {
  const members = new Set(memberIds);
  const relevant = decisions.filter((decision) => members.has(decision.modelId)).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const approved = relevant.find((decision) => approvers.has(decision.authorEmail.toLowerCase())) ?? null;
  const proposals = relevant.filter((decision) => !approvers.has(decision.authorEmail.toLowerCase()) && (!approved || time(decision.createdAt) > time(approved.createdAt)));
  return { approved, proposals };
}

export type RebindState = 'none' | 'proposed' | 'planned' | 'executed' | 'failed' | 'undone';

/** Current state of the latest plan for a report, derived from the append-only log. */
export function rebindStateFor(log: RebindActionRecord[], reportId: string, approvers: Set<string>) {
  const plans = log.filter((row) => row.kind === 'planned' && row.reportId === reportId).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const plan = plans[0] ?? null;
  if (!plan) return { plan: null, state: 'none' as RebindState, outcome: null };
  const outcome =
    log.filter((row) => row.planId === plan.id && row.kind !== 'planned').sort((a, b) => time(b.createdAt) - time(a.createdAt))[0] ?? null;
  const approved = approvers.has(plan.authorEmail.toLowerCase());
  const state: RebindState = !outcome
    ? approved
      ? 'planned'
      : 'proposed'
    : outcome.kind === 'executed' || outcome.kind === 'undo_failed'
      ? 'executed'
      : outcome.kind === 'undone'
        ? 'undone'
        : 'failed';
  return { plan, state, outcome };
}

export function useActions(api: ActionsApi = functionsActionsApi) {
  const [email, setEmail] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<Set<string>>(new Set());
  const [decisions, setDecisions] = useState<TrustedModelDecisionRecord[]>([]);
  const [log, setLog] = useState<RebindActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [sessionEmail, approverList, decisionRows, logRows] = await Promise.allSettled([api.sessionEmail(), api.approvers(), api.decisions(), api.rebindLog()]);
    const value = <T,>(result: PromiseSettledResult<T>, fallback: T) => (result.status === 'fulfilled' ? result.value : fallback);
    setEmail(value(sessionEmail, null));
    // Without the approver list nobody is treated as an approver, so no approve/run controls show.
    setApprovers(new Set(value(approverList, [] as string[]).map((entry) => entry.toLowerCase())));
    setDecisions(value(decisionRows, []));
    setLog(value(logRows, []));
    const failed = [sessionEmail, approverList, decisionRows, logRows].filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) console.error('Failed to load next actions', failed.map((result) => result.reason));
    setError(
      decisionRows.status === 'rejected' || logRows.status === 'rejected'
        ? 'Next actions could not be loaded. Try again shortly.'
        : approverList.status === 'rejected'
          ? 'The approver list is unavailable, so approve and rebind controls are hidden. Try again shortly.'
          : null
    );
    setLoading(false);
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of external data
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T,>(operation: (author: string) => Promise<T>): Promise<T | null> => {
      if (!email) {
        setError('Sign in to record next actions.');
        return null;
      }
      setBusy(true);
      setError(null);
      let failure: string | null = null;
      try {
        return await operation(email);
      } catch (error) {
        console.error('Next action failed', error);
        failure = 'The action could not be saved. Check your access and try again.';
        return null;
      } finally {
        await refresh();
        if (failure) setError(failure);
        setBusy(false);
      }
    },
    [email, refresh]
  );

  const decide = useCallback(
    (decision: NewDecision) =>
      run((authorEmail) => api.createDecision({ ...decision, id: newId(), authorEmail, createdAt: new Date() })),
    [api, run]
  );

  const planRebind = useCallback(
    (plan: NewRebindPlan) =>
      run((authorEmail) => api.createRebind({ ...plan, id: newId(), kind: 'planned', authorEmail, createdAt: new Date() })),
    [api, run]
  );

  /** Executes (or undoes) an approved plan via the function, then records the outcome as the signed-in user. */
  const perform = useCallback(
    (plan: RebindActionRecord, mode: 'execute' | 'undo') =>
      run(async (authorEmail) => {
        const result = mode === 'execute' ? await api.execute(plan.id) : await api.undo(plan.id);
        const ok = result.status !== 'failed';
        const kind = mode === 'execute' ? (ok ? 'executed' : 'failed') : ok ? 'undone' : 'undo_failed';
        const message = result.error?.message ?? (result.status === 'already_bound' ? 'The report already used the target model.' : undefined);
        const details = {
          reportId: plan.reportId,
          reportName: plan.reportName,
          reportWorkspaceId: plan.reportWorkspaceId,
          reportWorkspaceName: plan.reportWorkspaceName,
          fromModelId: plan.fromModelId,
          fromModelName: plan.fromModelName,
          toModelId: plan.toModelId,
          toModelName: plan.toModelName,
          coverage: plan.coverage,
          coverageOverride: plan.coverageOverride,
        };
        await api.createRebind({ ...details, id: newId(), kind, planId: plan.id, message, authorEmail, createdAt: new Date() });
        return result;
      }),
    [api, run]
  );

  const isApprover = Boolean(email && approvers.has(email.toLowerCase()));
  return { email, approvers, isApprover, decisions, log, loading, busy, error, refresh, decide, planRebind, perform };
}

export type ActionsState = ReturnType<typeof useActions>;
