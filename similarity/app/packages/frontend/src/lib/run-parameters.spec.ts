import { describe, expect, it } from 'vitest';

import { DEFAULT_RUN_PARAMETERS, toNotebookParameters, validateRunParameters } from '@rayfin-app/shared';

describe('shared run parameter contract', () => {
  it('accepts defaults and trims names', () => {
    const result = validateRunParameters({ ...DEFAULT_RUN_PARAMETERS, modelName: '  Sales ' });
    expect(result.errors).toEqual([]);
    expect(result.parameters?.modelName).toBe('Sales');
  });

  it('treats missing names as blank (unfiltered)', () => {
    const input: Partial<typeof DEFAULT_RUN_PARAMETERS> = { ...DEFAULT_RUN_PARAMETERS };
    delete input.workspaceName;
    expect(validateRunParameters(input).parameters?.workspaceName).toBe('');
  });

  it.each([
    [{ duplicateThreshold: 0 }, 'duplicateThreshold'],
    [{ containmentThreshold: 1.01 }, 'containmentThreshold'],
    [{ similarThreshold: Number.NaN }, 'similarThreshold'],
    [{ similarThreshold: 0.96 }, 'similarThreshold'],
    [{ enableBlocking: 'yes' }, 'enableBlocking'],
    [{ modelName: 7 }, 'modelName'],
    [{ workspaceName: 'x'.repeat(257) }, 'workspaceName'],
  ])('rejects %o', (override, field) => {
    const result = validateRunParameters({ ...DEFAULT_RUN_PARAMETERS, ...override });
    expect(result.parameters).toBeNull();
    expect(result.errors.map((e) => e.field)).toContain(field);
  });

  it('rejects non-object input', () => {
    expect(validateRunParameters(null).parameters).toBeNull();
    expect(validateRunParameters([1]).parameters).toBeNull();
  });

  it('maps to the notebook parameter cell names and Fabric types', () => {
    expect(toNotebookParameters(DEFAULT_RUN_PARAMETERS)).toEqual({
      WORKSPACE_NAME: { value: '', type: 'string' },
      MODEL_NAME: { value: '', type: 'string' },
      REPORT_WORKSPACE_NAME: { value: '', type: 'string' },
      ENABLE_BLOCKING: { value: true, type: 'bool' },
      DUPLICATE_THRESHOLD: { value: 0.95, type: 'float' },
      SIMILAR_THRESHOLD: { value: 0.7, type: 'float' },
      CONTAINMENT_THRESHOLD: { value: 0.95, type: 'float' },
    });
  });
});
