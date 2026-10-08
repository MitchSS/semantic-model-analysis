import { describe, expect, it } from 'vitest';

import {
  buildMapCells,
  compareScores,
  formatPercent,
  pairKey,
  safeUrl,
  selectMapModels,
  toFinding,
  toRunSummary,
  toSecurityState,
} from './similarity-model';
import { fixtureDataset, MODEL_IDS } from '@/test/fixtures';

describe('similarity model shaping', () => {
  it('classifies findings with duplicate > coverage > similar precedence', () => {
    expect(toFinding({ tier: 'duplicate', combinedScore: 0.99, containmentRelationship: 'equivalent' })).toBe('duplicate');
    expect(toFinding({ tier: 'distinct', combinedScore: 0.3, containmentRelationship: 'model_a_contains_model_b' })).toBe('coverage');
    expect(toFinding({ tier: 'similar', combinedScore: 0.8, containmentRelationship: 'partial_overlap' })).toBe('similar');
    expect(toFinding({ tier: 'unassessed', combinedScore: null, containmentRelationship: 'partial_overlap' })).toBe('unassessed');
    expect(toFinding({ tier: 'distinct', combinedScore: 0.2, containmentRelationship: 'partial_overlap' })).toBe('distinct');
  });

  it('maps unknown security statuses to unavailable', () => {
    expect(toSecurityState('match')).toBe('match');
    expect(toSecurityState('incomplete')).toBe('unavailable');
    expect(toSecurityState(null)).toBe('unavailable');
  });

  it('keys pairs independently of order', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });

  it('sorts unavailable scores last in both directions', () => {
    expect([0.2, null, 0.9].sort((a, b) => compareScores(a, b))).toEqual([0.9, 0.2, null]);
    expect([0.2, null, 0.9].sort((a, b) => compareScores(a, b, 'asc'))).toEqual([0.2, 0.9, null]);
  });

  it('builds a dataset with resolved model names, stats and clusters', () => {
    const dataset = fixtureDataset();
    expect(dataset.models.map((m) => m.name)).toEqual(['Finance', 'People', 'Sales', 'Sales Copy']);
    expect(dataset.pairs[0]).toMatchObject({ finding: 'duplicate', crossWorkspace: true, securityState: 'different' });
    expect(dataset.pairs[0].a).toEqual({ id: MODEL_IDS.salesA, name: 'Sales', workspace: 'Commercial' });
    expect(dataset.stats[MODEL_IDS.salesA]).toMatchObject({ tables: 12, measures: 40, columns: null });
    expect(dataset.clusters).toHaveLength(1);
    expect(dataset.clusters[0]).toMatchObject({ workspaceCount: 2, securityDiffers: true });
    expect(dataset.clusters[0].bestPair?.combined).toBe(0.97);
  });

  it('only allows https Fabric and Power BI report links', () => {
    expect(safeUrl('https://app.powerbi.com/groups/1/reports/2')).toBe('https://app.powerbi.com/groups/1/reports/2');
    expect(safeUrl('https://app.fabric.microsoft.com/x')).toBe('https://app.fabric.microsoft.com/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('http://app.powerbi.com/x')).toBeNull();
    expect(safeUrl('https://powerbi.com.evil.example/x')).toBeNull();
  });

  it('builds map cells with scored, unscored and self states', () => {
    const dataset = fixtureDataset();
    const models = selectMapModels(dataset, 3);
    expect(models.map((m) => m.name)).toEqual(['Sales', 'Sales Copy', 'Finance']);
    const cells = buildMapCells(models, dataset.pairs);
    expect(cells).toHaveLength(9);
    const state = (a: string, b: string) => cells.find((c) => c.row.id === a && c.column.id === b)?.state;
    expect(state(MODEL_IDS.salesA, MODEL_IDS.salesA)).toBe('self');
    expect(state(MODEL_IDS.salesB, MODEL_IDS.salesA)).toBe('scored');
    expect(state(MODEL_IDS.salesB, MODEL_IDS.finance)).toBe('unscored');
  });

  it('normalizes the run summary and formats percentages', () => {
    expect(toRunSummary(undefined)).toBeNull();
    expect(toRunSummary({ modelCount: 3, enableBlocking: true, generatedAt: '' })).toMatchObject({
      modelCount: 3,
      enableBlocking: true,
      generatedAt: null,
      pairCount: null,
    });
    expect(formatPercent(0.954)).toBe('95%');
    expect(formatPercent(null)).toBe('—');
  });
});
