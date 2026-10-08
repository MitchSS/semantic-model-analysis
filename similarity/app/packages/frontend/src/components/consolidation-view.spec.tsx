import type { RebindActionRecord, TrustedModelDecisionRecord } from '@rayfin-app/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConsolidationView } from '@/components/consolidation-view';
import type { ActionsState } from '@/hooks/use-actions';
import { consolidationCandidates, coverageWithin, defaultTargetForPair, rebindScript, suggestedTargets } from '@/lib/actions';
import { Results, initialViewState } from '@/lib/results/logic';
import { fixturePayload } from '@/test/fixtures';

// Sales (demo-sales) and Sales Restricted (demo-sales-east) get GUIDs so their reports can be rebound.
const SALES = '00000000-0000-4000-8000-00000000000a';
const EAST = '00000000-0000-4000-8000-00000000000b';
const WS = '00000000-0000-4000-8000-0000000000aa';

function payload() {
  const raw = JSON.stringify(fixturePayload()).replaceAll('demo-sales-east', EAST).replaceAll('"demo-sales"', `"${SALES}"`).replaceAll('demo-retail', WS);
  const data = JSON.parse(raw);
  let next = 100;
  for (const reports of Object.values(data.reportDependencies.byModel) as { reportType?: string; id: string }[][]) {
    reports.forEach((report) => {
      report.reportType = 'PowerBIReport';
      report.id = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
    });
  }
  return data;
}

const decision = (modelId: string, modelName: string): TrustedModelDecisionRecord => ({
  id: `d-${modelId}`,
  groupKey: `model:${modelId}`,
  modelId,
  modelName,
  workspaceId: WS,
  workspaceName: 'Demo Retail',
  authorEmail: 'boss@contoso.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

function setup(overrides: Partial<ActionsState> = {}, targetId: string | null = SALES) {
  const results = new Results(payload());
  const state = initialViewState(results.data);
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
  const onTargetChange = vi.fn();
  const onCompare = vi.fn();
  render(<ConsolidationView results={results} state={state} onHelp={vi.fn()} onCompare={onCompare} actions={actions} targetId={targetId} onTargetChange={onTargetChange} />);
  return { results, state, actions, onTargetChange, onCompare };
}

const expand = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Reports for ${name}` }));

describe('ConsolidationView', () => {
  it('lists every review candidate for the target with coverage and report counts', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Sales' })).toBeVisible();
    expect(screen.getByText('4 of 4 models · 4 linked reports')).toBeVisible();
    expect(within(screen.getByLabelText('Candidate finding')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All findings (4)',
      'Possible duplicates (1)',
      'Schema coverage (2)',
      'Shared structure (1)',
    ]);
    const rows = within(screen.getByRole('region', { name: 'Consolidation candidates' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Sales Restricted');
    expect(rows[1]).toHaveTextContent('Possible duplicates');
    fireEvent.click(screen.getByLabelText('Only models with reports'));
    expect(screen.getByText('2 of 4 models · 4 linked reports')).toBeVisible();
  });

  it('defaults to the strongest suggestion and lets you pick another target', () => {
    const { onTargetChange } = setup({}, null);
    const list = screen.getByRole('list', { name: 'Target models' });
    expect(within(list).getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(list).getByRole('button', { name: /^Inventory/ }));
    expect(onTargetChange).toHaveBeenCalledWith('demo-inventory');
  });

  it('approves the target as trusted in the model context', () => {
    const { actions } = setup();
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Certified source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve as trusted model' }));
    expect(actions.decide).toHaveBeenCalledWith(expect.objectContaining({ groupKey: `model:${SALES}`, modelId: SALES, rationale: 'Certified source' }));
  });

  it('only lets non-approvers propose', () => {
    setup({ isApprover: false, email: 'dev@contoso.com' });
    expect(screen.getByRole('button', { name: 'Propose as trusted model' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve as trusted model' })).toBeNull();
  });

  it('shows reports read-only until the target is trusted', () => {
    setup();
    expect(screen.getByText('Approve Sales as a trusted model to plan report rebinds.')).toBeVisible();
    expand('Sales Restricted');
    expect(screen.getByText('East Weekly')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve rebind plan' })).toBeNull();
  });

  it('plans, runs and scripts rebinds once the target is trusted', () => {
    const { actions } = setup({ decisions: [decision(SALES, 'Sales')] });
    expect(screen.getByRole('link', { name: 'Open Sales settings' })).toHaveAttribute('href', `https://app.powerbi.com/groups/${WS}/settings/datasets/${SALES}`);
    expand('Sales Restricted');
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve rebind plan' })[0]);
    expect(actions.planRebind).toHaveBeenCalledWith(expect.objectContaining({ fromModelId: EAST, toModelId: SALES, coverageOverride: false }));
  });

  it('runs an approved plan and offers a script', () => {
    const results = new Results(payload());
    const report = results.reportsFor(EAST)[0];
    const plan: RebindActionRecord = {
      id: 'p1',
      kind: 'planned',
      reportId: report.id,
      reportName: report.name,
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
    const { actions } = setup({ decisions: [decision(SALES, 'Sales')], log: [plan] });
    expand('Sales Restricted');
    fireEvent.click(screen.getByRole('button', { name: 'Rebind now' }));
    expect(actions.perform).toHaveBeenCalledWith(plan, 'execute');
    fireEvent.click(screen.getByRole('button', { name: 'Run it yourself' }));
    expect(screen.getByText(/Invoke-PowerBIRestMethod -Method Post/)).toBeVisible();
  });

  it('warns when a candidate is also trusted', () => {
    setup({ decisions: [decision(SALES, 'Sales'), decision(EAST, 'Sales Restricted')] });
    expect(screen.getByText('Also trusted')).toBeVisible();
  });

  it('opens Compare for a candidate', () => {
    const { onCompare } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Compare Sales and Sales Restricted' }));
    expect(onCompare).toHaveBeenCalledWith(SALES, EAST, 'security');
  });
});

describe('consolidation helpers', () => {
  const results = new Results(fixturePayload());
  const state = initialViewState(results.data);

  it('reads directional coverage for the candidate within the target', () => {
    expect(coverageWithin(results, 'demo-sales-core', 'demo-sales')).toBe(1);
    expect(coverageWithin(results, 'demo-sales', 'demo-inventory')).toBeNull();
    expect(consolidationCandidates(results, state, 'demo-sales').find((candidate) => candidate.id === 'demo-sales-core')?.category.kind).toBe('containment');
  });

  it('ranks trusted targets first, then by candidate count', () => {
    const ranked = suggestedTargets(results, state, new Set(['demo-inventory']));
    expect(ranked[0]).toMatchObject({ id: 'demo-inventory', trusted: true, candidates: 0 });
    expect(ranked[1].candidates).toBeGreaterThanOrEqual(ranked[2].candidates);
  });

  it('defaults a pair to the trusted side, else the side the other is contained in', () => {
    expect(defaultTargetForPair(results, state, 'demo-sales', 'demo-sales-core', new Set())).toBe('demo-sales');
    expect(defaultTargetForPair(results, state, 'demo-sales', 'demo-sales-core', new Set(['demo-sales-core']))).toBe('demo-sales-core');
  });

  it('builds a rebind script with an undo line', () => {
    const script = rebindScript({ reportId: 'r', reportName: 'A "quoted" report', reportWorkspaceId: 'w', fromModelId: 'f', toModelId: 't' });
    expect(script).toContain(`-Url "groups/w/reports/r/Rebind" -Body '{"datasetId":"t"}'`);
    expect(script).toContain(`# Invoke-PowerBIRestMethod -Method Post -Url "groups/w/reports/r/Rebind" -Body '{"datasetId":"f"}'`);
    expect(script).not.toContain('"quoted"');
  });
});
