/**
 * Results payload — the same contract notebook 002 embeds as APP_DATA, built from the
 * lakehouse rows the app reads. Port of 002's `build_report_dependency_payload`,
 * `build_security_results` and `render_results` payload assembly.
 *
 * Parity exception: the app never reads security definitions, so it cannot recompute a
 * model's security fingerprint from its role rules; it trusts the saved fingerprint and
 * role count instead. Everything else follows 002.
 */

export interface NamedEntry {
  key: string;
  name: string;
}
export interface ColumnEntry extends NamedEntry {
  table: string;
  tableKey: string;
}
export interface MeasureEntry extends NamedEntry {
  daxId: number;
  daxHash: string;
}
export interface RelationshipEntry {
  key: string;
  from: string;
  to: string;
}
export interface QueryEntry extends NamedEntry {
  mId: number;
  mHash: string;
}

export type ModelSecurityStatus = 'complete' | 'incomplete' | 'inconsistent' | 'not_collected';
export interface ModelSecurity {
  status: ModelSecurityStatus;
  fingerprint: string | null;
  roleCount: number | null;
}

export interface PayloadModel {
  name: string;
  workspace: string;
  workspaceId: string;
  tables: NamedEntry[];
  columns: ColumnEntry[];
  measures: MeasureEntry[];
  relationships: RelationshipEntry[];
  datasources: NamedEntry[];
  queries: QueryEntry[];
  security: ModelSecurity;
}

export type SecurityStatus = 'match' | 'different' | 'not_applicable' | 'unknown';

export interface SecurityEvidence {
  components?: { role_definitions?: number | null; rls_propagation?: number | null };
  effective_weights?: Record<string, number>;
  role_matches?: { role_a: number; role_b: number; score: number }[];
  unmatched_roles_a?: number[];
  unmatched_roles_b?: number[];
  [key: string]: unknown;
}

export interface PayloadPair {
  idA: string;
  idB: string;
  modelA: string;
  workspaceA: string;
  modelB: string;
  workspaceB: string;
  scored: true;
  schema: number | null;
  security: number | null;
  combined: number | null;
  securityStatus: SecurityStatus;
  scoreMode: string;
  securityEvidence: SecurityEvidence;
  scoreStatus: 'current' | 'legacy' | 'inconsistent' | 'security_unavailable';
  containment: number | null;
  relationship: string;
  containedId: string;
  containingId: string;
  containedCoverage: number | null;
  aInB: number | null;
  bInA: number | null;
  crossWorkspace: boolean;
  sameName: boolean;
  jaccard: {
    tables: number | null;
    columns: number | null;
    measures: number | null;
    relationships: number | null;
    datasources: number | null;
  };
  daxCosine: number | null;
  powerQuery: number | null;
  powerQueryStatus: string;
  sharedQueries: number | null;
}

export interface ReportEntry {
  id: string;
  name: string;
  workspaceId: string;
  workspace: string;
  url: string;
  modelId: string;
  crossWorkspace: boolean;
  /** App-only: Power BI report type, used to decide whether a rebind is possible. */
  reportType?: string;
  reason?: string;
}

export interface ReportPayload {
  status: string;
  scannedAt: string;
  scope: string;
  workspaceCount: number;
  incompleteWorkspaces: number;
  reportCount: number;
  linkedReportCount: number;
  byModel: Record<string, ReportEntry[]>;
  otherReports: ReportEntry[];
  scans: { workspace: string; status: string; reportCount: number; errorType: string }[];
}

export interface ModelListEntry {
  id: string;
  name: string;
  workspace: string;
  workspaceId: string;
}

export interface ResultsPayload {
  generatedAt: string;
  summary: { models: number };
  thresholds: { duplicate: number | null; similar: number | null; containment: number | null };
  allPairs: PayloadPair[];
  models: Record<string, PayloadModel>;
  modelList: ModelListEntry[];
  daxPool: string[];
  mPool?: string[];
  defaultCompare: { a: string; b: string };
  reportDependencies: ReportPayload;
  combinedWeights: { schema: number; security: number } | null;
  securityNotice: string;
  scoreVersion: number;
}

export const SCORE_VERSION = 3;

/** Lakehouse rows as returned by the connector (camelCase properties). */
export type Row = Record<string, unknown>;
export interface RawRows {
  run: Row[];
  models: Row[];
  signatures: Row[];
  pairs: Row[];
  tables: Row[];
  columns: Row[];
  measures: Row[];
  relationships: Row[];
  datasources: Row[];
  queries: Row[];
  /** `null` when the report tables could not be read. */
  reports: Row[] | null;
  reportScans: Row[] | null;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Python `str(value or "")` for display values. */
export function disp(value: unknown): string {
  if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) return '';
  return String(value);
}

/** 002 `norm`: whitespace collapsed, trimmed, case-folded. */
export function norm(value: unknown): string {
  return disp(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 002 `norm_dax`: comments removed, whitespace collapsed, case-folded. */
export function normDax(value: unknown): string {
  return disp(value)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Port of the shared `norm_m` (notebooks 001 and 002). */
export function normM(value: unknown): string {
  if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) return '';
  const pieces: string[] = [];
  for (const match of String(value).matchAll(/"(?:[^"]|"")*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[^"/]+|[/"]/g)) {
    const token = match[0];
    if (token.startsWith('"') && token.length > 1) pieces.push(token);
    else if (token.startsWith('/*') || token.startsWith('//')) pieces.push(' ');
    else pieces.push(token.toLowerCase());
  }
  return pieces.join('').replace(/\s+/g, ' ').trim();
}

/** Short stable hash for equality checks (002 uses md5[:12]; only equality is consumed). */
export function textHash(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function rounded(value: unknown): number | null {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return isNumber(numeric) ? Math.round(numeric * 1e4) / 1e4 : null;
}

function unitNumber(value: unknown): number | null {
  if (typeof value === 'boolean') return null;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return isNumber(numeric) && numeric >= 0 && numeric <= 1 ? numeric : null;
}

const fold = (value: unknown) => disp(value).toLowerCase();
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sortedKey = (values: number[]) => [...new Set(values)].sort((a, b) => a - b).join(',');

// ---- build_report_dependency_payload ------------------------------------------------------

export function buildReportPayload(
  models: Record<string, { workspace_id: string }>,
  reports: Row[] | null,
  scans: Row[] | null
): ReportPayload {
  const result: ReportPayload = {
    status: 'not_collected',
    scannedAt: '',
    scope: '',
    workspaceCount: 0,
    incompleteWorkspaces: 0,
    reportCount: 0,
    linkedReportCount: 0,
    byModel: Object.fromEntries(Object.keys(models).map((id) => [id, [] as ReportEntry[]])),
    otherReports: [],
    scans: [],
  };
  if (reports === null || scans === null) {
    result.status = 'unavailable';
    return result;
  }
  if (!scans.length) return result;
  const scanIds = new Set(scans.map((row) => row.scanId));
  const scanWorkspaces = new Set(scans.map((row) => row.reportWorkspaceId));
  const scopes = new Set(scans.map((row) => row.scanScope));
  if (
    scanIds.size !== 1 ||
    !scans[0].scanId ||
    scopes.size !== 1 ||
    scanWorkspaces.size !== scans.length ||
    reports.some((row) => !scanIds.has(row.scanId))
  ) {
    result.status = 'inconsistent';
    return result;
  }
  const unique = new Map<string, Row>();
  for (const row of reports) {
    if (!row.reportWorkspaceId || !row.reportId || !scanWorkspaces.has(row.reportWorkspaceId)) {
      result.status = 'inconsistent';
      return result;
    }
    const key = `${String(row.reportWorkspaceId)}\u0000${String(row.reportId)}`;
    const existing = unique.get(key);
    if (existing && existing.modelId !== row.modelId) {
      result.status = 'inconsistent';
      return result;
    }
    unique.set(key, row);
  }
  const workspaceCounts = new Map<unknown, number>();
  for (const row of unique.values()) {
    workspaceCounts.set(row.reportWorkspaceId, (workspaceCounts.get(row.reportWorkspaceId) ?? 0) + 1);
  }
  if (scans.some((row) => row.reportCount !== (workspaceCounts.get(row.reportWorkspaceId) ?? 0))) {
    result.status = 'inconsistent';
    return result;
  }
  result.incompleteWorkspaces = scans.filter((row) => row.scanStatus !== 'complete').length;
  result.status = result.incompleteWorkspaces ? 'partial' : 'complete';
  result.scannedAt = disp(scans[0].scannedAt);
  result.scope = disp(scans[0].scanScope) || 'Unknown scope';
  result.workspaceCount = scans.filter((row) => Boolean(row.reportWorkspaceId)).length;
  result.scans = scans.map((row) => ({
    workspace: disp(row.reportWorkspaceName) || 'Workspace discovery',
    status: disp(row.scanStatus) || 'unknown',
    reportCount: Math.trunc(Number(row.reportCount) || 0),
    errorType: disp(row.errorType),
  }));
  const modelIndex = new Map(Object.keys(models).map((id) => [id.toLowerCase(), id]));
  for (const row of unique.values()) {
    const modelId = modelIndex.get(fold(row.modelId));
    const workspaceId = String(row.reportWorkspaceId);
    const reportId = String(row.reportId);
    const report: ReportEntry = {
      id: reportId,
      name: disp(row.reportName) || reportId,
      workspaceId,
      workspace: disp(row.reportWorkspaceName) || workspaceId,
      url: `https://app.powerbi.com/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}`,
      modelId: modelId ?? '',
      crossWorkspace: false,
      reportType: disp(row.reportType),
    };
    if (modelId !== undefined && row.reportType === 'PowerBIReport') {
      report.crossWorkspace = workspaceId.toLowerCase() !== fold(models[modelId].workspace_id);
      result.byModel[modelId].push(report);
      result.linkedReportCount += 1;
    } else {
      const reasons: Record<string, string> = {
        missing_dataset_id: 'Missing model binding',
        unsupported_report_type: 'Unsupported report type',
      };
      report.reason = reasons[disp(row.bindingStatus)] ?? 'Model outside catalog';
      result.otherReports.push(report);
    }
  }
  const order = (a: ReportEntry, b: ReportEntry) =>
    cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.workspace.toLowerCase(), b.workspace.toLowerCase()) || cmp(a.id, b.id);
  for (const group of [...Object.values(result.byModel), result.otherReports]) group.sort(order);
  result.reportCount = unique.size;
  return result;
}

// ---- build_security_results -----------------------------------------------------------------

type SecurityFields = Pick<PayloadPair, 'schema' | 'security' | 'combined' | 'securityStatus' | 'scoreMode' | 'securityEvidence' | 'scoreStatus'>;
interface SecurityContext {
  models: Record<string, ModelSecurity>;
  pairs: SecurityFields[];
  notice: string;
  combinedWeights: { schema: number; security: number } | null;
}

export function buildSecurityResults(modelRows: Row[], signatureRows: Row[], pairRows: Row[], runRows: Row[]): SecurityContext {
  const result: SecurityContext = { models: {}, pairs: [], notice: '', combinedWeights: null };
  const meta: Row = runRows.length === 1 ? runRows[0] : {};
  let currentRun =
    meta.scoreVersion === SCORE_VERSION &&
    typeof meta.analysisRunId === 'string' &&
    Boolean(meta.analysisRunId) &&
    meta.modelCount === signatureRows.length &&
    meta.pairCount === pairRows.length;
  let weights: { schema: number; security: number } | null = null;
  try {
    const parsed = JSON.parse(String(meta.combinedWeightsJson)) as Row;
    const keys = Object.keys(parsed).sort();
    if (keys.join() !== 'schema,security' || keys.some((key) => unitNumber(parsed[key]) === null)) throw new Error('weights');
    const total = (parsed.schema as number) + (parsed.security as number);
    if (total <= 0) throw new Error('weights');
    weights = { schema: (parsed.schema as number) / total, security: (parsed.security as number) / total };
    result.combinedWeights = currentRun ? weights : null;
  } catch {
    currentRun = false;
  }
  const group = (rows: Row[]) => {
    const map = new Map<string, Row[]>();
    for (const row of rows) map.set(String(row.modelId), [...(map.get(String(row.modelId)) ?? []), row]);
    return map;
  };
  const savedByModel = group(signatureRows);
  const currentByModel = group(modelRows);
  for (const [modelId, identities] of currentByModel) {
    const security: ModelSecurity = { status: 'not_collected', fingerprint: null, roleCount: null };
    result.models[modelId] = security;
    const saved = savedByModel.get(modelId) ?? [];
    if (!saved.length) continue;
    if (!currentRun || identities.length !== 1 || saved.length !== 1) {
      security.status = 'inconsistent';
      continue;
    }
    const identity = identities[0];
    const snapshot = saved[0];
    if (
      snapshot.scoreVersion !== SCORE_VERSION ||
      snapshot.analysisRunId !== meta.analysisRunId ||
      typeof identity.catalogScanId !== 'string' ||
      !identity.catalogScanId ||
      (['modelId', 'workspaceId', 'catalogScanId'] as const).some((key) => snapshot[key] !== identity[key])
    ) {
      security.status = 'inconsistent';
      continue;
    }
    if (snapshot.securityScanStatus !== 'complete') {
      security.status = 'incomplete';
      continue;
    }
    if (typeof snapshot.securityFingerprint !== 'string' || !snapshot.securityFingerprint || !Number.isInteger(snapshot.roleCount)) {
      security.status = 'inconsistent';
      continue;
    }
    Object.assign(security, { status: 'complete', fingerprint: snapshot.securityFingerprint, roleCount: snapshot.roleCount });
  }

  const pairCounts = new Map<string, number>();
  for (const row of pairRows) {
    const key = [String(row.modelIdA), String(row.modelIdB)].sort().join('|');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  for (const row of pairRows) {
    const newFormat = row.scoreVersion === SCORE_VERSION;
    const schema = unitNumber(newFormat ? row.schemaScore : row.compositeScore);
    const fields: SecurityFields = {
      schema,
      security: null,
      combined: null,
      securityStatus: 'unknown',
      scoreMode: 'unavailable_security',
      securityEvidence: {},
      scoreStatus: newFormat ? 'inconsistent' : 'legacy',
    };
    result.pairs.push(fields);
    if (!newFormat || !currentRun || row.analysisRunId !== meta.analysisRunId) continue;
    const idA = String(row.modelIdA);
    const idB = String(row.modelIdB);
    if (pairCounts.get([idA, idB].sort().join('|')) !== 1) continue;
    const left = result.models[idA];
    const right = result.models[idB];
    if (left?.status !== 'complete' || right?.status !== 'complete') {
      fields.scoreStatus = 'security_unavailable';
      continue;
    }
    if (
      row.securityFingerprintA !== left.fingerprint ||
      row.securityFingerprintB !== right.fingerprint ||
      row.catalogScanIdA !== currentByModel.get(idA)?.[0]?.catalogScanId ||
      row.catalogScanIdB !== currentByModel.get(idB)?.[0]?.catalogScanId
    ) {
      continue;
    }
    const rolesA = left.roleCount ?? 0;
    const rolesB = right.roleCount ?? 0;
    const expectedStatus: SecurityStatus = !rolesA && !rolesB ? 'not_applicable' : left.fingerprint === right.fingerprint ? 'match' : 'different';
    try {
      const securityScore = unitNumber(row.securityScore);
      const combined = unitNumber(row.combinedScore);
      if (schema === null || combined === null || row.securityComparisonStatus !== expectedStatus) throw new Error('scores');
      const mode = expectedStatus === 'not_applicable' ? 'schema_only_no_security' : 'combined';
      if (row.scoreMode !== mode) throw new Error('mode');
      let expectedCombined: number;
      if (expectedStatus === 'not_applicable') {
        if (securityScore !== null) throw new Error('security');
        expectedCombined = schema;
      } else {
        if (securityScore === null || !weights) throw new Error('security');
        expectedCombined = weights.schema * schema + weights.security * securityScore;
      }
      if (Math.abs(combined - expectedCombined) > 1e-12) throw new Error('combined');
      const evidence = JSON.parse(String(row.securityEvidenceJson)) as SecurityEvidence;
      if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.role_matches)) throw new Error('evidence');
      if (!Array.isArray(evidence.unmatched_roles_a) || !Array.isArray(evidence.unmatched_roles_b)) throw new Error('evidence');
      const matchedA = new Set<number>();
      const matchedB = new Set<number>();
      for (const match of evidence.role_matches) {
        const a = match.role_a;
        const b = match.role_b;
        if (
          !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= rolesA || b >= rolesB ||
          matchedA.has(a) || matchedB.has(b) || unitNumber(match.score) === null
        ) {
          throw new Error('alignment');
        }
        matchedA.add(a);
        matchedB.add(b);
      }
      const unmatched = (count: number, matched: Set<number>) => [...Array(count).keys()].filter((i) => !matched.has(i));
      if (
        sortedKey(evidence.unmatched_roles_a) !== sortedKey(unmatched(rolesA, matchedA)) ||
        sortedKey(evidence.unmatched_roles_b) !== sortedKey(unmatched(rolesB, matchedB))
      ) {
        throw new Error('alignment');
      }
      Object.assign(fields, {
        security: securityScore,
        combined,
        securityStatus: expectedStatus,
        scoreMode: mode,
        securityEvidence: evidence,
        scoreStatus: 'current',
      });
    } catch {
      continue;
    }
  }
  if (result.pairs.some((pair) => pair.scoreStatus === 'legacy' || pair.scoreStatus === 'inconsistent')) {
    result.notice = 'Some saved scores lack aligned security evidence. Run 001 again; legacy composite values are shown only as schema scores.';
  } else if (result.pairs.some((pair) => pair.securityStatus === 'unknown')) {
    result.notice =
      'Security could not be fully assessed for some models. Their schema scores remain available; security and combined scores are unavailable.';
  }
  return result;
}

// ---- render_results payload assembly ---------------------------------------------------------

function sharedQueries(value: unknown): number | null {
  const count = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
}

export function buildPayload(raw: RawRows, now: Date = new Date()): ResultsPayload {
  if (!raw.models.length) throw new Error('No rows in semantic_models in the attached lakehouse. Run 001_semantic_model_similarity first.');
  const signatures = new Map<string, { workspace_id: string; workspace_name: string; model_name: string }>();
  for (const row of raw.models) {
    const id = String(row.modelId);
    signatures.set(id, { workspace_id: disp(row.workspaceId), workspace_name: disp(row.workspaceName), model_name: disp(row.modelName) || id });
  }
  const reportPayload = buildReportPayload(Object.fromEntries(signatures), raw.reports, raw.reportScans);
  const security = buildSecurityResults(raw.models, raw.signatures, raw.pairs, raw.run);

  const meta = raw.run.length === 1 ? raw.run[0] : null;
  const thresholds = meta
    ? { duplicate: Number(meta.duplicateThreshold), similar: Number(meta.similarThreshold), containment: Number(meta.containmentThreshold) }
    : { duplicate: 0.95, similar: 0.7, containment: 0.95 };

  const pooled = (pool: string[], index: Map<string, number>, text: string) => {
    if (!text) return -1;
    let id = index.get(text);
    if (id === undefined) {
      id = pool.length;
      pool.push(text);
      index.set(text, id);
    }
    return id;
  };
  const daxPool: string[] = [];
  const daxIndex = new Map<string, number>();
  const mPool: string[] = [];
  const mIndex = new Map<string, number>();

  interface Inventory {
    tables: Map<string, string>;
    columns: Map<string, Omit<ColumnEntry, 'key'>>;
    measures: Map<string, Omit<MeasureEntry, 'key'>>;
    relationships: Map<string, Omit<RelationshipEntry, 'key'>>;
    datasources: Map<string, string>;
    queries: Map<string, Omit<QueryEntry, 'key'>>;
  }
  const inventories = new Map<string, Inventory>();
  for (const id of signatures.keys()) {
    inventories.set(id, { tables: new Map(), columns: new Map(), measures: new Map(), relationships: new Map(), datasources: new Map(), queries: new Map() });
  }
  const setDefault = <V,>(map: Map<string, V>, key: string, value: () => V) => {
    if (!map.has(key)) map.set(key, value());
  };

  for (const row of raw.tables) {
    const inv = inventories.get(String(row.modelId));
    const key = norm(row.tableName);
    if (inv && key) setDefault(inv.tables, key, () => disp(row.tableName));
  }
  for (const row of raw.columns) {
    const inv = inventories.get(String(row.modelId));
    const tableKey = norm(row.tableName);
    const columnKey = norm(row.columnName);
    if (inv && columnKey) {
      setDefault(inv.columns, `${tableKey}.${columnKey}`, () => ({ table: disp(row.tableName), tableKey, name: disp(row.columnName) }));
    }
  }
  for (const row of raw.measures) {
    const inv = inventories.get(String(row.modelId));
    const key = norm(row.measureName);
    const expression = disp(row.expression);
    if (inv && key) {
      setDefault(inv.measures, key, () => {
        const normalized = normDax(expression);
        return { name: disp(row.measureName), daxId: pooled(daxPool, daxIndex, expression), daxHash: normalized ? textHash(normalized) : '' };
      });
    }
  }
  for (const row of raw.relationships) {
    const inv = inventories.get(String(row.modelId));
    if (!inv) continue;
    const key = `${norm(row.fromTable)}.${norm(row.fromColumn)}->${norm(row.toTable)}.${norm(row.toColumn)}`;
    setDefault(inv.relationships, key, () => ({
      from: `${disp(row.fromTable)}[${disp(row.fromColumn)}]`,
      to: `${disp(row.toTable)}[${disp(row.toColumn)}]`,
    }));
  }
  for (const row of raw.datasources) {
    const inv = inventories.get(String(row.modelId));
    const connection = row.connectionString || row.connectionDetails || row.datasourceName;
    const key = norm(connection);
    if (inv && key) setDefault(inv.datasources, key, () => disp(connection));
  }
  const mPartitions = new Map<string, number>();
  for (const row of raw.queries) {
    if (row.queryKind === 'partition' && normM(row.expression)) {
      const key = `${String(row.modelId)}\u0000${norm(row.tableName)}`;
      mPartitions.set(key, (mPartitions.get(key) ?? 0) + 1);
    }
  }
  for (const row of raw.queries) {
    const modelId = String(row.modelId);
    const inv = inventories.get(modelId);
    const expression = disp(row.expression);
    const normalized = normM(expression);
    if (!inv || !normalized) continue;
    let key: string;
    let name: string;
    if (row.queryKind === 'shared_expression') {
      key = `expression:${norm(row.partitionName)}`;
      name = `Expression: ${disp(row.partitionName)}`;
    } else {
      key = `table:${norm(row.tableName)}`;
      name = disp(row.tableName);
      if ((mPartitions.get(`${modelId}\u0000${norm(row.tableName)}`) ?? 0) > 1) {
        key = `${key}/${norm(row.partitionName)}`;
        name = `${name} (${disp(row.partitionName)})`;
      }
    }
    // 001's expression_hash covers the full M; the SQL endpoint may truncate long text.
    const hash = typeof row.expressionHash === 'string' && row.expressionHash ? row.expressionHash : textHash(normalized);
    setDefault(inv.queries, key, () => ({ name, mId: pooled(mPool, mIndex, expression), mHash: hash }));
  }

  const models: Record<string, PayloadModel> = {};
  for (const [id, identity] of signatures) {
    const inv = inventories.get(id)!;
    models[id] = {
      name: identity.model_name,
      workspace: identity.workspace_name,
      workspaceId: identity.workspace_id,
      tables: [...inv.tables].map(([key, name]) => ({ key, name })),
      columns: [...inv.columns].map(([key, value]) => ({ key, ...value })),
      measures: [...inv.measures].map(([key, value]) => ({ key, ...value })),
      relationships: [...inv.relationships].map(([key, value]) => ({ key, ...value })),
      datasources: [...inv.datasources].map(([key, name]) => ({ key, name })),
      queries: [...inv.queries].map(([key, value]) => ({ key, ...value })),
      security: security.models[id] ?? { status: 'not_collected', fingerprint: null, roleCount: null },
    };
  }

  const allPairs: PayloadPair[] = raw.pairs.map((row, index) => {
    const idA = String(row.modelIdA);
    const idB = String(row.modelIdB);
    const sigA = signatures.get(idA);
    const sigB = signatures.get(idB);
    const aInB = rounded(row.modelAInModelB);
    const bInA = rounded(row.modelBInModelA);
    const relationship = disp(row.containmentRelationship);
    let containedId = '';
    let containingId = '';
    let containedCoverage: number | null = null;
    if (relationship === 'model_a_contains_model_b') [containedId, containingId, containedCoverage] = [idB, idA, bInA];
    else if (relationship === 'model_b_contains_model_a') [containedId, containingId, containedCoverage] = [idA, idB, aInB];
    else if (relationship === 'equivalent') containedCoverage = Math.max(aInB ?? 0, bInA ?? 0);
    else if ((aInB ?? 0) >= (bInA ?? 0)) [containedId, containingId, containedCoverage] = [idA, idB, aInB];
    else [containedId, containingId, containedCoverage] = [idB, idA, bInA];
    return {
      idA,
      idB,
      modelA: sigA?.model_name || disp(row.modelA) || idA,
      workspaceA: sigA?.workspace_name || disp(row.workspaceA),
      modelB: sigB?.model_name || disp(row.modelB) || idB,
      workspaceB: sigB?.workspace_name || disp(row.workspaceB),
      scored: true,
      ...security.pairs[index],
      containment: rounded(row.containmentScore),
      relationship,
      containedId,
      containingId,
      containedCoverage,
      aInB,
      bInA,
      crossWorkspace: Boolean(row.crossWorkspace ?? false),
      sameName: Boolean(row.sameModelName ?? false),
      jaccard: {
        tables: rounded(row.jaccardTables),
        columns: rounded(row.jaccardColumns),
        measures: rounded(row.jaccardMeasureNames),
        relationships: rounded(row.jaccardRelationships),
        datasources: rounded(row.jaccardDatasources),
      },
      daxCosine: rounded(row.daxEmbeddingCosine),
      powerQuery: rounded(row.powerQuerySimilarity),
      powerQueryStatus: disp(row.powerQueryStatus) || 'unknown',
      sharedQueries: sharedQueries(row.sharedQueryCount),
    };
  });

  const modelList: ModelListEntry[] = Object.entries(models)
    .map(([id, model]) => ({ id, name: model.name, workspace: model.workspace, workspaceId: model.workspaceId }))
    .sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.workspace.toLowerCase(), b.workspace.toLowerCase()));

  let defaultCompare = { a: '', b: '' };
  if (allPairs.length) {
    const rank = (pair: PayloadPair): [number, number] => [pair.combined !== null ? 1 : 0, pair.combined ?? pair.schema ?? 0];
    const best = allPairs.reduce((top, pair) => {
      const [p1, p2] = rank(pair);
      const [t1, t2] = rank(top);
      return p1 > t1 || (p1 === t1 && p2 > t2) ? pair : top;
    });
    defaultCompare = { a: best.idA, b: best.idB };
  } else if (modelList.length >= 2) {
    defaultCompare = { a: modelList[0].id, b: modelList[1].id };
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    generatedAt: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`,
    summary: { models: modelList.length },
    thresholds: { duplicate: rounded(thresholds.duplicate), similar: rounded(thresholds.similar), containment: rounded(thresholds.containment) },
    allPairs,
    models,
    modelList,
    daxPool,
    mPool,
    defaultCompare,
    reportDependencies: reportPayload,
    combinedWeights: security.combinedWeights,
    securityNotice: security.notice,
    scoreVersion: SCORE_VERSION,
  };
}
