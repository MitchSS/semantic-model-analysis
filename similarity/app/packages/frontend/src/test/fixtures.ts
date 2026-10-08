import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { LoadedResults } from '@/lib/results/load';
import type { ResultsPayload } from '@/lib/results/payload';

/** The notebook 002 renderer fixture, so app tests exercise the same payload as the notebook tests. */
const scripts = resolve(import.meta.dirname, '../../../../../../.github/scripts');

export function fixturePayload(): ResultsPayload {
  const payload = JSON.parse(readFileSync(resolve(scripts, 'similarity_results_fixture.json'), 'utf8')) as ResultsPayload;
  // One unsafe URL proves only https://app.powerbi.com links render as anchors.
  payload.reportDependencies.byModel['demo-sales-east'][0].url = 'javascript:alert(1)';
  return payload;
}

export function fixtureResults(): LoadedResults {
  return {
    payload: fixturePayload(),
    run: {
      analysisRunId: 'run-1',
      generatedAt: '2026-10-01T08:12:30Z',
      duplicateThreshold: 0.95,
      similarThreshold: 0.7,
      containmentThreshold: 0.95,
      enableBlocking: true,
      modelCount: 6,
      pairCount: 10,
      duplicateCount: 1,
      similarCount: 2,
      unassessedCount: 4,
      containmentCount: 5,
      clusterCount: 1,
    },
    truncated: false,
    errors: [{ workspace: 'Demo Retail', model: 'Broken', errorType: 'Timeout', message: 'timed out' }],
  };
}
