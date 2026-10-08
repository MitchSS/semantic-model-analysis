import type { RebindActionRecord, TrustedModelDecisionRecord } from '@rayfin-app/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rayfin-client', () => ({ getRayfinClient: vi.fn() }));

import { rebindStateFor, trustedModelFor, useActions, type ActionsApi } from './use-actions';

const approvers = new Set(['boss@contoso.com']);
const decision = (modelId: string, authorEmail: string, minute: number): TrustedModelDecisionRecord => ({
  id: `${modelId}-${minute}`,
  groupKey: 'g',
  modelId,
  modelName: modelId,
  workspaceId: 'w',
  workspaceName: 'W',
  authorEmail,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
});
const action = (overrides: Partial<RebindActionRecord>): RebindActionRecord => ({
  id: 'p1',
  kind: 'planned',
  reportId: 'r1',
  reportName: 'R',
  reportWorkspaceId: 'w',
  reportWorkspaceName: 'W',
  fromModelId: 'a',
  fromModelName: 'A',
  toModelId: 'b',
  toModelName: 'B',
  coverageOverride: false,
  authorEmail: 'Boss@Contoso.com',
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0)),
  ...overrides,
});

describe('trustedModelFor', () => {
  it('uses the latest approver decision among the group members', () => {
    const rows = [decision('a', 'boss@contoso.com', 1), decision('b', 'BOSS@contoso.com', 2), decision('z', 'boss@contoso.com', 3)];
    expect(trustedModelFor(rows, ['a', 'b'], approvers).approved?.modelId).toBe('b');
  });

  it('treats non-approver rows as proposals newer than the approval', () => {
    const rows = [decision('a', 'dev@contoso.com', 1), decision('b', 'boss@contoso.com', 2), decision('a', 'dev@contoso.com', 3)];
    const result = trustedModelFor(rows, ['a', 'b'], approvers);
    expect(result.approved?.modelId).toBe('b');
    expect(result.proposals.map((row) => row.id)).toEqual(['a-3']);
  });
});

describe('rebindStateFor', () => {
  it('derives proposed, planned, executed, failed and undone states', () => {
    expect(rebindStateFor([], 'r1', approvers).state).toBe('none');
    expect(rebindStateFor([action({ authorEmail: 'dev@contoso.com' })], 'r1', approvers).state).toBe('proposed');
    expect(rebindStateFor([action({})], 'r1', approvers).state).toBe('planned');
    const executed = action({ id: 'o1', kind: 'executed', planId: 'p1', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 1)) });
    expect(rebindStateFor([action({}), executed], 'r1', approvers).state).toBe('executed');
    const undoFailed = action({ id: 'o2', kind: 'undo_failed', planId: 'p1', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 2)) });
    expect(rebindStateFor([action({}), executed, undoFailed], 'r1', approvers).state).toBe('executed');
    const undone = action({ id: 'o3', kind: 'undone', planId: 'p1', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 3)) });
    expect(rebindStateFor([action({}), executed, undone], 'r1', approvers).state).toBe('undone');
    expect(rebindStateFor([action({}), action({ id: 'o4', kind: 'failed', planId: 'p1' })], 'r1', approvers).state).toBe('failed');
  });
});

function fakeApi(overrides: Partial<ActionsApi> = {}): ActionsApi {
  return {
    sessionEmail: vi.fn(async () => 'Boss@Contoso.com'),
    approvers: vi.fn(async () => ['boss@contoso.com']),
    decisions: vi.fn(async () => []),
    rebindLog: vi.fn(async () => []),
    createDecision: vi.fn(async () => undefined),
    createRebind: vi.fn(async (row: RebindActionRecord) => ({ id: row.id })),
    execute: vi.fn(async () => ({ status: 'rebound' as const, previousModelId: 'a', error: null })),
    undo: vi.fn(async () => ({ status: 'rebound' as const, previousModelId: 'b', error: null })),
    ...overrides,
  };
}

describe('useActions', () => {
  it('recognises approvers case-insensitively and stamps the session email as author', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useActions(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isApprover).toBe(true);
    await act(async () => {
      await result.current.decide({ groupKey: 'g', modelId: 'a', modelName: 'A', workspaceId: 'w', workspaceName: 'W' });
    });
    expect(api.createDecision).toHaveBeenCalledWith(expect.objectContaining({ authorEmail: 'Boss@Contoso.com', modelId: 'a' }));
  });

  it('keeps the log when the approver list is unavailable', async () => {
    const api = fakeApi({ approvers: vi.fn(async () => Promise.reject(new Error('404'))), rebindLog: vi.fn(async () => [action({})]) });
    const { result } = renderHook(() => useActions(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.log).toHaveLength(1);
    expect(result.current.isApprover).toBe(false);
    expect(result.current.error).toMatch(/approver list is unavailable/);
  });

  it('records the outcome of a rebind as the signed-in user', async () => {
    const api = fakeApi({ execute: vi.fn(async () => ({ status: 'failed' as const, previousModelId: 'z', error: { code: 'wrong_binding' as const, message: 'moved' } })) });
    const { result } = renderHook(() => useActions(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.perform(action({}), 'execute');
    });
    expect(api.execute).toHaveBeenCalledWith('p1');
    expect(api.createRebind).toHaveBeenCalledWith(expect.objectContaining({ kind: 'failed', planId: 'p1', message: 'moved', authorEmail: 'Boss@Contoso.com' }));
  });

  it('reports a failed save after refreshing', async () => {
    const api = fakeApi({ createDecision: vi.fn(async () => Promise.reject(new Error('policy'))) });
    const { result } = renderHook(() => useActions(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.decide({ groupKey: 'g', modelId: 'a', modelName: 'A', workspaceId: 'w', workspaceName: 'W' });
    });
    expect(result.current.error).toMatch(/could not be saved/);
  });
});
