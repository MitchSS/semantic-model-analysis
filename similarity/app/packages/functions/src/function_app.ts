import {
  UserDataFunctions,
  AudienceType,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';
import type {
  SimilarityRefreshResult,
  SimilarityRunListResult,
  SimilarityRunParameters,
  SimilarityRunResult,
} from '@rayfin-app/shared';

import type { Inline } from './inline.js';
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
