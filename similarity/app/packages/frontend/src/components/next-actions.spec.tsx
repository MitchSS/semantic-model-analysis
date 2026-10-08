import type { RebindActionRecord, TrustedModelDecisionRecord } from '@rayfin-app/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GroupActions } from '@/components/next-actions';
import type { ActionsState } from '@/hooks/use-actions';
import { coverageWithin, rebindScript } from '@/lib/actions';
import { Results, initialViewState } from '@/lib/results/logic';
import { fixturePayload } from '@/test/fixtures';

// Fixture group: Sales (demo-sales) and Sales Restricted (demo-sales-east). IDs are made GUIDs so rebinds are allowed.
const SALES = '00000000-0000-4000-8000-00000000000a';
const EAST = '00000000-0000-4000-8000-00000000000b';
const WS = '00000000-0000-4000-8000-0000000000aa';

function setup(overrides: Partial<ActionsState> = {}) {
  const raw = JSON.stringify(fixturePayload()).replaceAll('demo-sales-east', EAST).replaceAll('"demo-sales"', `"${SALES}"`).replaceAll('demo-retail', WS);
  const payload = JSON.parse(raw);
  for (const reports of Object.values(payload.reportDependencies.byModel) as { reportType?: string; id: string }[][]) {
    reports.forEach((report, index) => {
      report.reportType = 'PowerBIReport';
      report.id = `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
    });
  }
  const results = new Results(payload);
  const state = initialViewState(payload);
  const group = results.buildGroups(state)[0];
  const actions: ActionsState = {
    email: 'boss@contoso.com',
    approvers: new Set(['boss@contoso.com']),
    isApprover: true,
    decisions: [],
    log: [],
    loading: false,
    busy: false,
    error: null,
    refresh: vi.fn(),
    decide: vi.fn(),
    planRebind: vi.fn(),
    perform: vi.fn(),
    ...overrides,
  };
  render(<GroupActions results={results} state={state} group={group} actions={actions} />);
  return { results, actions };
}

const approved = (modelId: string, name: string): TrustedModelDecisionRecord => ({
  id: 'd1',
  groupKey: 'g',
  modelId,
  modelName: name,
  workspaceId: WS,
  workspaceName: 'Demo Retail',
  authorEmail: 'boss@contoso.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('GroupActions', () => {
  it('lets an approver approve a trusted model', () => {
    const { actions } = setup();
    expect(screen.getByText('No trusted model approved for this group yet.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Certified source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve as trusted model' }));
    expect(actions.decide).toHaveBeenCalledWith(expect.objectContaining({ modelId: SALES, modelName: 'Sales', rationale: 'Certified source' }));
  });

  it('only lets others propose', () => {
    setup({ isApprover: false, email: 'dev@contoso.com' });
    expect(screen.getByRole('button', { name: 'Propose as trusted model' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve as trusted model' })).toBeNull();
  });

  it('offers endorsement guidance and plans rebinds for reports on other members', () => {
    const { actions } = setup({ decisions: [approved(SALES, 'Sales')] });
    expect(screen.getByRole('link', { name: 'Open Sales settings' })).toHaveAttribute('href', `https://app.powerbi.com/groups/${WS}/settings/datasets/${SALES}`);
    expect(screen.getByText('East Orders')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve rebind plan' })[0]);
    expect(actions.planRebind).toHaveBeenCalledWith(expect.objectContaining({ fromModelId: EAST, toModelId: SALES, coverageOverride: false }));
  });

  it('runs and undoes approved plans', () => {
    const plan: RebindActionRecord = {
      id: 'p1',
      kind: 'planned',
      reportId: '00000000-0000-4000-8000-000000000100',
      reportName: 'East Weekly',
      reportWorkspaceId: WS,
      reportWorkspaceName: 'Demo Retail',
      fromModelId: EAST,
      fromModelName: 'Sales Restricted',
      toModelId: SALES,
      toModelName: 'Sales',
      coverageOverride: false,
      authorEmail: 'boss@contoso.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { actions } = setup({ decisions: [approved(SALES, 'Sales')], log: [plan] });
    fireEvent.click(screen.getByRole('button', { name: 'Rebind now' }));
    expect(actions.perform).toHaveBeenCalledWith(plan, 'execute');
    fireEvent.click(screen.getByRole('button', { name: 'Run it yourself' }));
    expect(screen.getByText(/Invoke-PowerBIRestMethod -Method Post/)).toBeVisible();
  });
});

describe('action helpers', () => {
  it('reads directional coverage for the report model within the trusted model', () => {
    const results = new Results(fixturePayload());
    expect(coverageWithin(results, 'demo-sales-core', 'demo-sales')).toBe(1);
    expect(coverageWithin(results, 'demo-sales', 'demo-inventory')).toBeNull();
  });

  it('builds a rebind script with an undo line', () => {
    const script = rebindScript({ reportId: 'r', reportName: 'A "quoted" report', reportWorkspaceId: 'w', fromModelId: 'f', toModelId: 't' });
    expect(script).toContain(`-Url "groups/w/reports/r/Rebind" -Body '{"datasetId":"t"}'`);
    expect(script).toContain(`# Invoke-PowerBIRestMethod -Method Post -Url "groups/w/reports/r/Rebind" -Body '{"datasetId":"f"}'`);
    expect(script).not.toContain('"quoted"');
  });
});
