import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rayfin-client', () => ({ getRayfinClient: vi.fn() }));

import { MAX_ROWS, readAll } from './load';

describe('readAll', () => {
  it('reads a table in one request without cursor paging', async () => {
    const fetch = vi.fn(async () => ({ items: [{ a: 1 }, { a: 2 }], hasNextPage: false }));
    await expect(readAll(fetch)).resolves.toEqual({ rows: [{ a: 1 }, { a: 2 }], truncated: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(MAX_ROWS);
  });

  it('reports more rows than the limit as truncated', async () => {
    const fetch = vi.fn(async () => ({ items: [{ a: 1 }], hasNextPage: true }));
    await expect(readAll(fetch)).resolves.toMatchObject({ truncated: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
