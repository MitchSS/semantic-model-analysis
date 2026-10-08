import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureDataset, MODEL_IDS } from '@/test/fixtures';

vi.mock('@microsoft/fabric-visuals', () => ({
  useCssTheme: () => ({}),
  VegaVisual: ({ onInteraction }: { onInteraction?: (events: unknown[]) => void }) => (
    <button
      type="button"
      data-testid="vega"
      onClick={() =>
        onInteraction?.([
          {
            action: 'select',
            selections: [{ predicates: [{ type: 'set', name: 'cellKey', values: [`${MODEL_IDS.finance}|${MODEL_IDS.hr}`] }] }],
          },
        ])
      }
    />
  ),
}));

const reload = vi.fn();
const start = vi.fn();
vi.mock('@/hooks/use-similarity-data', () => ({
  useSimilarityData: () => ({ status: 'ready', data: fixtureDataset(), error: null, reload }),
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

describe('App', () => {
  beforeEach(() => {
    start.mockReset();
  });

  it('ranks review candidates by overall score with security warnings', () => {
    render(<App />);
    const table = screen.getByRole('region', { name: 'Ranked comparisons' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Possible duplicate');
    expect(rows[0]).toHaveTextContent('97%');
    expect(rows[0]).toHaveTextContent('Security differs');
    expect(rows[1]).toHaveTextContent('Shared structure');
    expect(rows[2]).toHaveTextContent('Schema coverage');
  });

  it('applies the cross-workspace scope across views', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Cross-workspace only'));
    const rows = within(screen.getByRole('region', { name: 'Ranked comparisons' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
  });

  it('opens a comparison from review and returns with Back', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare Sales and Sales Copy' }));
    expect(screen.getByRole('heading', { name: 'Compare models' })).toBeVisible();
    expect(screen.getByText('Dependent reports · Sales')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Pipeline' })).toHaveAttribute('href', 'https://app.powerbi.com/groups/x/reports/y');
    expect(screen.queryByRole('link', { name: 'Open Bad link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  });

  it('labels unscored comparisons rather than showing zero', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    fireEvent.change(screen.getByLabelText('Model A'), { target: { value: MODEL_IDS.salesB } });
    fireEvent.change(screen.getByLabelText('Model B'), { target: { value: MODEL_IDS.hr } });
    expect(screen.getByText(/Not scored\./)).toBeVisible();
  });

  it('shows duplicate groups', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('button', { name: /Sales, Sales Copy/ })).toHaveTextContent('97%');
  });

  it('opens a comparison from a similarity map cell', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Similarity map' }));
    fireEvent.click(screen.getByTestId('vega'));
    expect(screen.getByLabelText('Model A')).toHaveValue(MODEL_IDS.finance);
    expect(screen.getByLabelText('Model B')).toHaveValue(MODEL_IDS.hr);
  });

  it('surfaces catalog errors', () => {
    render(<App />);
    expect(screen.getByText('1 model could not be read during the last scan')).toBeVisible();
  });

  it('validates run parameters before starting a run', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run analysis' }));
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
