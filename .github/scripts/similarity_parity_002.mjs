// Parity snapshot from notebook 002's renderer. Must produce the same JSON as the app's
// `paritySnapshot` (similarity/app/packages/frontend/src/lib/results/parity.ts).
import vm from 'node:vm';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { script, fixture } = JSON.parse(input);
const entrypoint = '\n  render();\n})();';
if (script.split(entrypoint).length !== 2) throw new Error('Renderer entrypoint must be unique');
const instrumented = script.replace(entrypoint, `
  globalThis.ui = {state, candidates, classify, buildGroups, workspaceOptions, reviewSelection, reviewQueueHTML, tierAt,
    relationshipText, relationshipSummary, containmentSummary, relevantSection, securityTagHTML, securityLabel, blendText,
    pairModelLabel, schemaSignalsHTML, compareData, mapSelection, mapResultsHTML, groupResultsHTML, groupSelection, groupKey,
    statusStripHTML, selectionLabel, reportCountText, shortReportCount, modelSecurityText, reportScopeText, shortReportStatus,
    reportsAvailable, reportsFor, model, pairKey, pairMap, MLIST};
})();`);

function create() {
  const context = vm.createContext({
    document: { getElementById: () => ({ querySelector: () => null }), documentElement: { getAttribute: () => 'light' } },
    localStorage: { getItem: () => null },
    URL,
  });
  vm.runInContext(instrumented.replace('__APP_DATA__', JSON.stringify(fixture).replace(/</g, '\\u003c')), context);
  return context.ui;
}

const decode = (html) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (value) => JSON.parse(JSON.stringify(value));
const ADJUSTED = { duplicate: 0.85, similar: 0.6, containment: 0.9 };

function withState(overrides, fn) {
  const ui = create();
  Object.assign(ui.state, overrides);
  return fn(ui);
}
const keyOf = (ui, pair) => ui.pairKey(pair.idA, pair.idB);

function scope(overrides) {
  return withState(overrides, (ui) => {
    const candidates = ui.candidates();
    const counts = { duplicate: 0, containment: 0, overlap: 0 };
    candidates.forEach((item) => counts[item.category.kind]++);
    return plain({
      candidates: candidates.map((item) => [keyOf(ui, item.pair), item.category.kind, Math.round(item.category.primary * 1e4) / 1e4]),
      counts,
      groups: ui.buildGroups().map((group) => ({
        members: group.members,
        strongest: keyOf(ui, group.strongest),
        securityDifferent: group.securityDifferent,
        securityUnknown: group.securityUnknown,
      })),
    });
  });
}

const review = (overrides) => withState(overrides, (ui) => plain(ui.reviewSelection().rows.map((row) => keyOf(ui, row.pair))));

const ui = create();
const workspaceOptions = plain(ui.workspaceOptions());
const firstWorkspace = workspaceOptions[0]?.[0] ?? 'all';

const pairs = [...fixture.allPairs]
  .sort((a, b) => ui.pairKey(a.idA, a.idB).localeCompare(ui.pairKey(b.idA, b.idB)))
  .map((pair) => {
    const live = ui.pairMap()[ui.pairKey(pair.idA, pair.idB)];
    const category = ui.classify(live);
    const signalsHTML = ui.schemaSignalsHTML(live);
    const signals = [...signalsHTML.matchAll(/<dt>([\s\S]*?)<\/dt><dd><span class="metric-value[^"]*">([\s\S]*?)<\/span>/g)].map((m) => [decode(m[1]), decode(m[2])]);
    return {
      key: ui.pairKey(pair.idA, pair.idB),
      tier: ui.tierAt(live.combined),
      kind: category ? category.kind : null,
      relationshipText: ui.relationshipText(live, category),
      relationshipSummary: ui.relationshipSummary(live),
      containmentSummary: ui.containmentSummary(live),
      relevantSection: ui.relevantSection(live),
      securityTag: decode(ui.securityTagHTML(live)),
      securityLabel: ui.securityLabel(live),
      blendText: ui.blendText(live),
      labels: [ui.pairModelLabel(pair.idA, pair.idB), ui.pairModelLabel(pair.idB, pair.idA)],
      signals,
    };
  });

const comparePairs = fixture.allPairs.map((pair) => [pair.idA, pair.idB]);
const ids = ui.MLIST.map((entry) => entry.id);
const unscored = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b])).find(([a, b]) => !ui.pairMap()[ui.pairKey(a, b)]);
if (unscored) comparePairs.push(unscored);
ui.state.cmpDiffOnly = false;
const compare = comparePairs.map(([a, b]) => {
  const diff = ui.compareData(ui.model(a), ui.model(b), 'A', 'B');
  return {
    key: `${a}>${b}`,
    shared: diff.shared,
    differences: diff.differences,
    sections: Object.fromEntries(
      Object.entries(diff.sections).map(([id, section]) => [
        id,
        {
          shared: section.shared,
          diff: section.diff,
          rows: section.rows.map((html) => {
            const match = html.match(/<div class="diff-row ([a-zA-Z]+)"><span class="status">[\s\S]*?<\/span><span>([\s\S]*?)<\/span><\/div>/);
            return [match[1], decode(match[2])];
          }),
        },
      ])
    ),
  };
});

function map(overrides) {
  return withState({ mapSize: 4, ...overrides }, (view) => {
    const selection = view.mapSelection();
    const html = view.mapResultsHTML();
    const body = html.slice(html.indexOf('<tbody>'));
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => {
        const style = cell[1].match(/class="matrix-cell ([a-z]+)"/)[1];
        return [style, decode(cell[1]).trim()];
      })
    );
    return plain({ models: selection.models.map((entry) => entry.id), pages: selection.pages, cells: rows });
  });
}

const groupsHTML = withState({ groupSearch: '' }, (view) => view.groupResultsHTML());
const groupLabels = [...groupsHTML.matchAll(/data-select-group="[^"]*"[^>]*>(Group \d+)<\/button>/g)].map((m) => m[1]);
const firstGroup = ui.buildGroups()[0];
const noneHTML = withState({ groupSearch: 'zzz-no-match' }, (view) => view.groupResultsHTML());

const strip = ui.statusStripHTML();
const statusStrip = {
  security: decode(strip.match(/>Security: ([^<]*)</)[1]),
  securityWarning: /class="status-link warning" data-help>Security:/.test(strip),
  reports: decode(strip.match(/>Reports: ([^<]*)</)[1]),
  reportsWarning: /class="status-link warning" data-help>Reports:/.test(strip),
  unknownWorkspace: Number((strip.match(/Workspace unknown: (\d+)/) || [0, 0])[1]),
};

const emptyHTML = withState({ search: 'zzz-no-match' }, (view) => view.reviewQueueHTML());
const counts = plain(ui.reviewSelection().counts);

const snapshot = {
  scopes: { all: scope({}), cross: scope({ crossOnly: true }), adjusted: scope({ thresholds: ADJUSTED }) },
  workspaceOptions,
  review: {
    default: review({}),
    sortSchemaAsc: review({ sort: 'schema', sortDirection: 'asc' }),
    sortCombinedDesc: review({ sort: 'combined', sortDirection: 'desc' }),
    filterDuplicate: review({ filter: 'duplicate' }),
    filterContainment: review({ filter: 'containment' }),
    workspace: review({ workspace: firstWorkspace }),
    securityDifferent: review({ security: 'different' }),
    powerQueryDiffers: review({ powerQuery: 'differs' }),
    powerQueryMatches: review({ powerQuery: 'matches' }),
    powerQueryNotApplicable: review({ powerQuery: 'not_applicable' }),
    searchSales: review({ search: 'sales' }),
    counts,
    emptyText: decode(emptyHTML.match(/<div class="empty">([\s\S]*?)<\/div>/)[1]),
  },
  pairs,
  compare,
  map: { all: map({}), page2: map({ mapPage: 2 }), cross: map({ crossOnly: true }), search: map({ mapSearch: 'sales' }) },
  groups: {
    labels: groupLabels,
    selection: firstGroup ? plain(ui.groupSelection(firstGroup)) : null,
    searchNone: decode(noneHTML.match(/<div class="empty">([\s\S]*?)<\/div>/)[1]),
  },
  statusStrip,
  models: ui.MLIST.map((entry) => ({
    id: entry.id,
    selectionLabel: ui.selectionLabel(entry.id),
    reportCountText: ui.reportCountText(entry.id),
    compareReportCount: ui.reportsAvailable() ? ui.reportsFor(entry.id).length + (fixture.reportDependencies.status === 'partial' ? ' known reports' : ' linked reports') : 'Unknown',
    shortReportCount: ui.shortReportCount(entry.id),
    securityText: ui.modelSecurityText(entry.id),
  })),
  reports: { scope: ui.reportScopeText(), status: ui.shortReportStatus() },
};
console.log(JSON.stringify(plain(snapshot)));
