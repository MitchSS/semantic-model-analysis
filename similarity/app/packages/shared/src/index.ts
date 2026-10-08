/**
 * Entity map shared by the data registration package and typed browser client.
 * Keep it in step with `schema` in `packages/data/src/index.ts`.
 */
import type { RebindActionRecord, TrustedModelDecisionRecord } from './actions.js';

export type UniversalAppSchema = {
  TrustedModelDecision: TrustedModelDecisionRecord;
  RebindAction: RebindActionRecord;
};

export * from './actions.js';
export * from './similarity-run.js';
