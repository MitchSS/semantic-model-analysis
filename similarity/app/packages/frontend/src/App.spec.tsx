import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureResults } from '@/test/fixtures';

const loaded = fixtureResults();
const reload = vi.fn();
const start = vi.fn();
vi.mock('@/hooks/use-similarity-data', () => ({
  useSimilarityData: () => ({ status: 'ready', data: loaded, error: null, reload }),
}));
vi.mock('@/hooks/use-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-actions')>()),
  useActions: () => ({ email: null, approvers: new Set(), isApprover: false, decisions: [], log: [], loading: false, busy: false, error: null, refresh: vi.fn(), decide: vi.fn(), planRebind: vi.fn(), perform: vi.fn() }),
}));
vi.mock('@/hooks/use-similarity-runs', () => ({
  useSimilarityRuns: () => ({
    runs: [{ id: 'r1', status: 'Completed', invokeType: 'Manual', startTimeUtc: '2026-10-01T08:00:00Z', endTimeUtc: '2026-10-01T08:12:30Z', failureMessage: null }],
    active: null,
    loading: false,
    busy: false,
    error: null,
    start,
    cancel: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import App from '@/App';

const queueRows = () => within(screen.getByRole('region', { name: 'Candidate pair scores' })).getAllByRole('row').slice(1);
const tab = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name }));

describe('App', () => {
  beforeEach(() => {
    start.mockReset();
    localStorage.clear();
  });

  it('ranks review candidates like notebook 002', () => {
    render(<App />);
    expect(screen.getByText('8 of 8 candidates')).toBeVisible();
    const rows = queueRows();
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('Sales');
    expect(rows[0]).toHaveTextContent('Sales Restricted');
    expect(rows[0]).toHaveTextContent('95.0%');
    expect(rows[0]).toHaveTextContent('Possible duplicates');
    expect(rows[0]).toHaveTextContent('Security differs');
    expect(rows[7]).toHaveTextContent('Shared structure');
    const finding = screen.getByLabelText('Finding');
    expect(within(finding).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All findings (8)',
      'Possible duplicates (1)',
      'Schema coverage (5)',
      'Shared structure (2)',
    ]);
  });

  it('filters by Power Query state and clears filters', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Power Query state'), { target: { value: 'not_applicable' } });
    expect(screen.getByText('1 of 8 candidates')).toBeVisible();
    expect(queueRows()[0]).toHaveTextContent('Sales Core');
    expect(queueRows()[0]).toHaveTextContent('Sales Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('8 of 8 candidates')).toBeVisible();
  });

  it('expands a row into the seven schema signals', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Score indicators for Sales and Sales Restricted' }));
    const region = screen.getByRole('region', { name: 'Schema similarity indicators for Sales and Sales Restricted' });
    expect(within(region).getAllByRole('meter')).toHaveLength(7);
    expect(within(region).getByRole('meter', { name: 'Power Query similarity' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('applies the cross-workspace scope', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Cross-workspace only'));
    expect(screen.getByText('Cross-workspace pairs')).toBeVisible();
    expect(screen.getByText('No cross-workspace candidates meet the current thresholds.')).toBeVisible();
  });

  it('reclassifies with applied thresholds', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Review thresholds' }));
    fireEvent.change(screen.getByLabelText('Possible duplicates minimum score percent value'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply thresholds' }));
    expect(within(screen.getByLabelText('Finding')).getByRole('option', { name: 'Possible duplicates (0)' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('sms-thresholds-v2') ?? '{}')).toMatchObject({ duplicate: 0.99 });
    fireEvent.change(screen.getByLabelText('Possible duplicates minimum score percent value'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply thresholds' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter percentages from 0 to 100.');
  });

  it('opens a comparison at the relevant section and returns with Back', () => {
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Compare Sales and Sales Restricted' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Compare models' })).toBeVisible();
    expect(screen.getByLabelText('Model A')).toHaveFocus();
    expect(screen.getByRole('button', { name: /Security definitions/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Duplicate labels use the overall score. Review the permission differences before considering replacement.')).toBeVisible();
    expect(screen.getByText('Schema coverage: A within B')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Dependent reports/ }));
    expect(screen.getByRole('link', { name: 'Margin Analysis' })).toHaveAttribute('href', 'https://app.powerbi.com/groups/demo-retail/reports/demo-sales-report-3');
    expect(screen.getByText('East Orders')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'East Orders' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(screen.getByText('8 of 8 candidates')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Compare Sales and Sales Restricted' })).toHaveFocus();
  });

  it('resets unapplied threshold edits to the defaults', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Review thresholds' }));
    const input = screen.getByLabelText('Possible duplicates minimum score percent value');
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }));
    expect(screen.getByLabelText('Possible duplicates minimum score percent value')).toHaveValue(95);
  });

  it('shows Power Query differences with M text', () => {
    render(<App />);
    tab('Compare');
    fireEvent.change(screen.getByLabelText('Model B'), { target: { value: 'demo-sales-core' } });
    fireEvent.click(screen.getByRole('button', { name: /Power Query/ }));
    const section = document.getElementById('section-queries')!;
    expect(within(section).getAllByText('Only in Sales').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('M query').length).toBeGreaterThan(0);
  });

  it('labels unscored comparisons rather than showing zero', () => {
    render(<App />);
    tab('Compare');
    fireEvent.change(screen.getByLabelText('Model A'), { target: { value: 'demo-inventory' } });
    expect(screen.getByText('Coverage: Not scored')).toBeVisible();
    expect(screen.getAllByText('Not scored').length).toBeGreaterThanOrEqual(3);
  });

  it('opens Consolidation from a Review row with the containing model as target', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Consolidate Sales and Sales Core' }));
    expect(screen.getByRole('heading', { name: 'Consolidation' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sales' })).toBeVisible();
    expect(screen.getByText('Models to consolidate into Sales')).toBeVisible();
  });

  it('opens Consolidation from Compare and returns there with Back', () => {
    render(<App />);
    tab('Compare');
    fireEvent.click(screen.getByRole('button', { name: 'Consolidate into B' }));
    expect(screen.getByRole('heading', { name: 'Sales Restricted' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Compare Sales Restricted and Sales' }));
    expect(screen.getByRole('heading', { name: 'Compare models' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Consolidation' }));
    expect(screen.getByRole('heading', { name: 'Sales Restricted' })).toBeVisible();
  });

  it('opens a comparison from a similarity map cell', () => {
    render(<App />);
    tab('Similarity map');
    expect(screen.getByText('Showing 1-6 of 6 filtered models / 6 catalog models')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^Compare Sales Forecast \(Workspace: Demo Retail\) and Sales Draft/ }));
    expect(screen.getByLabelText('Model A')).toHaveValue('demo-sales-forecast');
    expect(screen.getByLabelText('Model B')).toHaveValue('demo-sales-draft');
  });

  it('opens the definitions dialog', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Definitions and scan details' }));
    expect(screen.getByRole('heading', { name: 'Definitions & scan details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close definitions' }));
    expect(screen.queryByRole('heading', { name: 'Definitions & scan details' })).toBeNull();
  });

  it('surfaces catalog errors', () => {
    render(<App />);
    expect(screen.getByText('1 model could not be read during the last scan')).toBeVisible();
  });

  it('validates run parameters before starting a run', async () => {
    render(<App />);
    tab('Run analysis');
    fireEvent.change(screen.getByLabelText('Similar threshold'), { target: { value: '0.99' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start run' })));
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByText('Must not exceed the duplicate threshold.')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Similar threshold'), { target: { value: '0.6' } });
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: ' Sales ' } });
    start.mockResolvedValue(null);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start run' })));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ workspaceName: 'Sales', similarThreshold: 0.6, enableBlocking: true }));
    expect(screen.getByText('12m 30s')).toBeVisible();
  });
});
