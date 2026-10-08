import {
  UserDataFunctions,
  AudienceType,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';
import type {
  ApproverList,
  RebindResult,
  SimilarityRefreshResult,
  SimilarityRunListResult,
  SimilarityRunParameters,
  SimilarityRunResult,
  UniversalAppSchema,
} from '@rayfin-app/shared';

import { parseApprovers } from './caller.js';
import type { Inline } from './inline.js';
import { rebindReport, safeRebind, validatePlan, type RebindPlan } from './rebind.js';
import { SimilarityRunClient, refreshResultsMetadata, safely } from './similarity-runs.js';

const udf = new UserDataFunctions();

udf.func(
  'startSimilarityRun',
  async (parameters: Inline<SimilarityRunParameters>, ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>): Promise<Inline<SimilarityRunResult>> =>
    safely(() => new SimilarityRunClient(ctx.Tokens.Fabric).start(parameters), { run: null }),
  []
);

udf.func(
  'getSimilarityRun',
  async (runId: string, ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>): Promise<Inline<SimilarityRunResult>> =>
    safely(() => new SimilarityRunClient(ctx.Tokens.Fabric).get(runId), { run: null }),
  []
);

udf.func(
  'listSimilarityRuns',
  async (ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>): Promise<Inline<SimilarityRunListResult>> =>
    safely(() => new SimilarityRunClient(ctx.Tokens.Fabric).list(), { runs: [] }),
  []
);

udf.func(
  'cancelSimilarityRun',
  async (runId: string, ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>): Promise<Inline<SimilarityRunResult>> =>
    safely(() => new SimilarityRunClient(ctx.Tokens.Fabric).cancel(runId), { run: null }),
  []
);

udf.func(
  'refreshSimilarityResults',
  async (ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>): Promise<Inline<SimilarityRefreshResult>> =>
    safely(() => refreshResultsMetadata(ctx.Tokens.Fabric), { refreshed: false }),
  []
);

udf.func(
  'listApprovers',
  async (ctx: RayfinContext<UniversalAppSchema>): Promise<Inline<ApproverList>> => ({
    approvers: [...parseApprovers(ctx.Secrets.APPROVER_EMAILS)].sort(),
  }),
  []
);

/** Reads a plan through the data service; its create policy guarantees `authorEmail` is the real author. */
async function readPlan(ctx: RayfinContext<UniversalAppSchema, AudienceType.Fabric>, planId: string): Promise<RebindPlan | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) return null;
  const rows = await ctx
    .getDataClient()
    .RebindAction.select(['id', 'kind', 'reportId', 'reportWorkspaceId', 'fromModelId', 'toModelId', 'authorEmail'])
    .where({ id: { eq: planId } })
    .execute();
  return (rows[0] as RebindPlan | undefined) ?? null;
}

udf.func(
  'executeRebind',
  async (planId: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Fabric>): Promise<Inline<RebindResult>> =>
    safeRebind(async () => {
      const plan = await readPlan(ctx, planId);
      const invalid = validatePlan(plan, ctx.Secrets.APPROVER_EMAILS);
      if (invalid || !plan) return invalid!;
      return rebindReport(ctx.Tokens.Fabric, plan.reportWorkspaceId, plan.reportId, plan.fromModelId, plan.toModelId);
    }),
  []
);

udf.func(
  'undoRebind',
  async (planId: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Fabric>): Promise<Inline<RebindResult>> =>
    safeRebind(async () => {
      const plan = await readPlan(ctx, planId);
      const invalid = validatePlan(plan, ctx.Secrets.APPROVER_EMAILS);
      if (invalid || !plan) return invalid!;
      return rebindReport(ctx.Tokens.Fabric, plan.reportWorkspaceId, plan.reportId, plan.toModelId, plan.fromModelId);
    }),
  []
);