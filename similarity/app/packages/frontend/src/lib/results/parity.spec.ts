import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { paritySnapshot } from './parity';
import type { ResultsPayload } from './payload';

// Shared with notebook 002's renderer tests: see .github/scripts/test_similarity_parity.py.
const scripts = resolve(import.meta.dirname, '../../../../../../../.github/scripts');
const read = (name: string) => JSON.parse(readFileSync(resolve(scripts, name), 'utf8'));

describe('notebook 002 parity', () => {
  it('derives exactly what notebook 002 derives from the shared fixture', () => {
    const fixture = read('similarity_results_fixture.json') as ResultsPayload;
    const expected = read('similarity_parity_expected.json');
    const actual = JSON.parse(JSON.stringify(paritySnapshot(fixture)));
    for (const key of Object.keys(expected)) {
      expect(actual[key], `parity section "${key}"`).toEqual(expected[key]);
    }
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  });
});
