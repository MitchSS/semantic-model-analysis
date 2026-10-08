import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildPayload, normM, type RawRows } from './payload';

const scripts = resolve(import.meta.dirname, '../../../../../../../.github/scripts');
const read = (name: string) => JSON.parse(readFileSync(resolve(scripts, name), 'utf8'));

/** Replace hash values with first-seen equality classes: only equality is meaningful. */
function normalize(payload: Record<string, unknown>) {
  const copy = JSON.parse(JSON.stringify(payload));
  delete copy.generatedAt;
  const classes = new Map<string, string>();
  const klass = (value: string) => {
    if (!value) return value;
    if (!classes.has(value)) classes.set(value, `h${classes.size}`);
    return classes.get(value)!;
  };
  for (const id of Object.keys(copy.models).sort()) {
    const model = copy.models[id];
    model.security = { status: model.security.status, fingerprint: model.security.fingerprint, roleCount: model.security.roleCount };
    for (const measure of model.measures) measure.daxHash = klass(`dax:${measure.daxHash}`);
    for (const query of model.queries) query.mHash = klass(`m:${query.mHash}`);
  }
  // App-only field used to decide whether a report can be rebound.
  const reports = copy.reportDependencies;
  for (const report of [...Object.values(reports.byModel).flat(), ...reports.otherReports] as Record<string, unknown>[]) {
    delete report.reportType;
  }
  return copy;
}

describe('payload parity with notebook 002', () => {
  it('builds the same payload as notebook 002 from the same lakehouse rows', () => {
    const raw = read('similarity_parity_raw.json') as RawRows;
    const expected = read('similarity_parity_payload_expected.json');
    const actual = normalize(buildPayload(raw) as unknown as Record<string, unknown>);
    const target = normalize(expected);
    for (const key of Object.keys(target)) {
      expect(actual[key], `payload field "${key}"`).toEqual(target[key]);
    }
  });

  it('normalizes M like notebooks 001 and 002', () => {
    expect(normM('let\n  // load\n  Source = Sql.Database("Srv01", "Sales DB"), /* note */\n  Rows = Source{[Schema="dbo"]}[Data]\nin Rows')).toBe(
      'let source = sql.database("Srv01", "Sales DB"), rows = source{[schema="dbo"]}[data] in rows'
    );
    expect(normM('Web.Contents("https://x/y") // c')).toBe('web.contents("https://x/y")');
    expect(normM('A "b')).toBe('a "b');
    expect(normM(null)).toBe('');
  });
});
