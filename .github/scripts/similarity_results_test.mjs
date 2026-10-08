import assert from 'node:assert/strict';
import vm from 'node:vm';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { script, fixture } = JSON.parse(input);
const entrypoint = '\n  render();\n})();';
assert.equal(script.split(entrypoint).length, 2, 'Renderer entrypoint must be unique');
const instrumented = script.replace(entrypoint, `
  globalThis.ui = {state, candidates, reviewSelection, reviewHTML, reviewQueueHTML, compareHTML,
    compareCoverageHTML, scoreCellHTML, securityTagHTML, tierAt, buildGroups, workspaceOptions,
    reportCompareHTML, helpHTML, mapHTML, mapSelection, mapResultsHTML, groupKey, groupsHTML, groupResultsHTML,
    groupSelection, inComparisonScope, setComparisonScope, clearReviewFilters, tabsHTML};
})();`);

function create(data = fixture) {
  const context = vm.createContext({
    document: { getElementById: () => ({querySelector: () => null}), documentElement: {getAttribute: () => 'light'} },
    localStorage: {getItem: () => null}, URL,
  });
  vm.runInContext(instrumented.replace('__APP_DATA__', JSON.stringify(data).replace(/</g, '\\u003c')), context);
  return context.ui;
}

function allScope(data = fixture) {
  const view = create(data);
  view.setComparisonScope(false);
  return view;
}

function crossScope(data = fixture) {
  const view = create(data);
  view.setComparisonScope(true);
  return view;
}

let assertions = 0;
function equal(actual, expected, name) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, name);
  assertions++;
}
function check(value, name) {
  assert.ok(value, name);
  assertions++;
}

const ui = allScope();
equal(ui.candidates().length, 8, 'Existing candidate count');
equal(ui.candidates().filter(item => item.category.kind === 'duplicate').length, 1, 'Possible duplicate count');
equal(ui.buildGroups().map(group => group.members), [['demo-sales', 'demo-sales-east']], 'Connected group membership');
check(ui.buildGroups()[0].securityDifferent, 'Different security is preserved across group members');
equal(ui.tierAt(0.95), 'duplicate', 'Inclusive threshold');
equal(ui.tierAt(0.94999), 'similar', 'Classification must not use rounded display values');
equal(ui.tierAt(null), 'unassessed', 'Unknown is not zero');
check(ui.scoreCellHTML(0).includes('0.0%'), 'True zero is displayed numerically');
check(ui.scoreCellHTML(null).includes('Unavailable'), 'Missing score remains unavailable');
check(!ui.scoreCellHTML(null).includes('width:0'), 'Missing score is not a zero bar');
check(ui.scoreCellHTML(null, 'Not applicable').includes('Not applicable'), 'No-role security remains separate');
check(ui.securityTagHTML({securityStatus: 'different'}).includes('Security differs'), 'Security exception remains visible');
check(ui.securityTagHTML({securityStatus: 'unknown'}).includes('Not assessed'), 'Unknown security is not matching');
check(!ui.reviewHTML().includes('<p'), 'No explanatory paragraphs in Review');
equal((ui.reviewQueueHTML().match(/data-pair-key=/g) || []).length, 8, 'One table row per pair');
check(ui.reviewQueueHTML().includes('95.0%'), 'Combined score remains visible');
equal((ui.reviewQueueHTML().match(/class="pair-indicators"/g)||[]).length,0,'Collapsed rows do not render indicator bodies');
const expandedPairKey=[fixture.allPairs[0].idA,fixture.allPairs[0].idB].sort().join('|');
ui.state.expandedPairs[expandedPairKey]=true;
let expandedQueue=ui.reviewQueueHTML();
equal((expandedQueue.match(/class="pair-indicators"/g)||[]).length,1,'Only the expanded pair renders indicators');
equal((expandedQueue.match(/role="meter"/g)||[]).length,7,'Expanded row shows all seven saved schema signals');
check(expandedQueue.includes('Power Query similarity'),'Expanded row includes the Power Query signal');
check(expandedQueue.includes('aria-expanded="true"'),'Disclosure exposes expanded state');
check(expandedQueue.includes('Relationship-link overlap'),'Expanded indicators include relationships');
equal((expandedQueue.match(/data-pair-key=/g)||[]).length,8,'Indicator rows do not alter candidate counts');
ui.state.search='no matching model';
equal((ui.reviewQueueHTML().match(/class="pair-indicators"/g)||[]).length,0,'Filtering hides the expanded pair without inventing rows');
ui.state.search='';
equal((ui.reviewQueueHTML().match(/class="pair-indicators"/g)||[]).length,1,'Expansion follows pair identity when filters are cleared');
ui.state.expandedPairs[expandedPairKey]=false;

ui.state.security = 'different';
equal(ui.reviewSelection().rows.length, 3, 'Security filter');
equal(ui.reviewSelection().counts, {duplicate: 1, containment: 1, overlap: 1}, 'Category counts share filter scope');
ui.state.filter = 'containment';
equal(ui.reviewSelection().rows.length, 1, 'Finding filter');
ui.state.search = 'core';
equal(ui.reviewSelection().rows.length, 1, 'Search matches the second model');
ui.state.search = 'missing model';
equal(ui.reviewSelection().rows.length, 0, 'Search can be empty without inventing rows');
check(ui.reviewQueueHTML().includes('No candidates match these filters'), 'Filtered-empty state');

Object.assign(ui.state, {search:'',filter:'all',security:'all',sort:'combined',sortDirection:'asc'});
let ordered = ui.reviewSelection().rows;
const available = ordered.filter(item => item.pair.combined !== null);
check(available.every((item,index) => !index || item.pair.combined >= available[index-1].pair.combined), 'Ascending score sort');
check(ordered.slice(-3).every(item => item.pair.combined === null), 'Unavailable scores last ascending');
ui.state.sortDirection = 'desc';
ordered = ui.reviewSelection().rows;
check(ordered.slice(-3).every(item => item.pair.combined === null), 'Unavailable scores last descending');
equal(ordered[0].pair.combined, 0.95, 'Highest combined remains first');

Object.assign(ui.state, {cmpA:'demo-sales',cmpB:'demo-sales-core'});
const forward = ui.compareCoverageHTML(fixture.allPairs.find(pair => pair.idA === 'demo-sales' && pair.idB === 'demo-sales-core'));
Object.assign(ui.state, {cmpA:'demo-sales-core',cmpB:'demo-sales'});
const reverse = ui.compareCoverageHTML(fixture.allPairs.find(pair => pair.idA === 'demo-sales' && pair.idB === 'demo-sales-core'));
check(forward.indexOf('74.8%') < forward.indexOf('100.0%'), 'Forward coverage has correct A/B values');
check(reverse.indexOf('100.0%') < reverse.indexOf('74.8%'), 'Swap reverses directional coverage');
check(ui.compareHTML().includes('Differences only'), 'Difference toggle retained');
check(!ui.compareHTML().includes('class="intro"'), 'Compare has no introductory prose');
Object.assign(ui.state, {cmpA:'demo-sales',cmpB:'demo-inventory'});
check(ui.compareHTML().includes('Not scored'), 'Unscored direct comparison still supported');
Object.assign(ui.state, {cmpA:'demo-sales',cmpB:'demo-sales'});
check(ui.compareHTML().includes('Choose two different models'), 'Self comparison handled');

const filtered = structuredClone(fixture);
for (const model of Object.values(filtered.models)) { model.workspace = 'Identical name'; model.workspaceId = 'workspace-a'; }
filtered.models['demo-sales-east'].workspaceId = 'workspace-b';
for (const model of filtered.modelList) model.workspace = 'Identical name';
const scopeUI = allScope(filtered);
equal(scopeUI.workspaceOptions().length, 2, 'Workspace identity is ID-based');
scopeUI.state.workspace = 'workspace-b';
equal(scopeUI.reviewSelection().rows.length, 4, 'Workspace selection matches either endpoint');
equal(new Set(scopeUI.workspaceOptions().map(entry => entry[1])).size, 2, 'Equal workspace names have disambiguated labels');

const malicious = structuredClone(fixture);
malicious.models['demo-sales'].name = '<img src=x onerror=alert(1)>';
const escapedUI = allScope(malicious);
check(!escapedUI.reviewQueueHTML().includes('<img'), 'Names are not interpreted as HTML');
check(escapedUI.reviewQueueHTML().includes('&lt;img'), 'Full escaped name remains available');

const partial = structuredClone(fixture);
partial.reportDependencies.status = 'partial';
check(create(partial).reportCompareHTML().includes('known reports'), 'Partial reports are not a complete count');
partial.reportDependencies.status = 'unavailable';
check(create(partial).reportCompareHTML().includes('Unknown'), 'Missing dependency inventory is unknown');
check(create().helpHTML().includes('View generated'), 'View time is not falsely labeled as scan freshness');
check(create().helpHTML().includes('not usage'), 'Usage limitation remains accessible on demand');
check(!ui.groupsHTML().includes('class="intro"'), 'Groups have no introductory prose');
check(ui.groupResultsHTML().includes('Highest pair score'), 'Group maximum is not labeled a group score');
const group = ui.buildGroups()[0];
equal(ui.groupKey(group), ui.groupKey({...group, members:[...group.members].reverse()}), 'Stable group key is independent of ordering');
ui.state.groupSearch = 'restricted';
check(ui.groupResultsHTML().includes('demo-sales'), 'Group search retains the entire connected group');
ui.state.groupSearch = 'unknown-name';
check(ui.groupResultsHTML().includes('No groups match'), 'Group search empty state');
equal(ui.mapSelection().visible.length,6,'Map ignores Review filters');
equal((ui.mapResultsHTML().match(/class="matrix-cell unscored"/g)||[]).length,10,'Map retains all blocked pair states');
equal((ui.mapResultsHTML().match(/class="matrix-cell unavailable"/g)||[]).length,8,'Map retains all unavailable score states');
check(!ui.mapHTML().includes('class="intro"'),'Map explanation is consolidated into the legend');
ui.state.mapSearch = 'inventory';
equal(ui.mapSelection().visible.map(model=>model.id),['demo-inventory'],'Map search includes models without scored pairs');
ui.state.mapSearch = 'missing';
check(ui.mapResultsHTML().includes('No models match'),'Map filtered-empty state');

const zeroData = structuredClone(fixture);
zeroData.allPairs[0].combined = 0;
check(allScope(zeroData).mapResultsHTML().includes('>0%</button>'),'Map true zero differs from dot/unknown');

const noModels = structuredClone(fixture);
noModels.modelList = []; noModels.models = {}; noModels.allPairs = [];
check(create(noModels).reviewQueueHTML().includes('No cataloged models'), 'Empty catalog state');
noModels.modelList = fixture.modelList.slice(0,1); noModels.models = {[noModels.modelList[0].id]: fixture.models[noModels.modelList[0].id]};
check(create(noModels).compareHTML().includes('Two cataloged models'), 'One-model state');

const connected = structuredClone(fixture);
connected.allPairs = [{...fixture.allPairs[0],idA:'demo-sales',idB:'demo-sales-east',combined:.96},
  {...fixture.allPairs[0],idA:'demo-sales-east',idB:'demo-sales-core',combined:.97},
  {...fixture.allPairs[0],idA:'demo-sales',idB:'demo-sales-core',combined:.60}];
const connectedUI = allScope(connected);
equal(connectedUI.buildGroups()[0].members.length, 3, 'Groups retain connected-component semantics');
equal(connectedUI.tierAt(.60), 'distinct', 'Indirect group membership does not manufacture a duplicate pair');

const many = structuredClone(fixture);
many.allPairs = [];
for (let index=0; index<80; index++) {
  const id='synthetic-'+index;
  many.models[id]={...fixture.models['demo-sales-east'],name:'Model '+index};
  many.modelList.push({id,name:'Model '+index,workspace:'Demo Retail'});
  many.allPairs.push({...fixture.allPairs[0],idB:id});
}
const manyUI = allScope(many);
equal((manyUI.reviewQueueHTML().match(/data-pair-key=/g)||[]).length,25,'Bounded default table rows');
manyUI.state.page = 4;
equal((manyUI.reviewQueueHTML().match(/data-pair-key=/g)||[]).length,5,'Last page row count');
manyUI.state.search = 'no matches';
manyUI.reviewQueueHTML();
equal(manyUI.state.page,1,'Filtering clamps stale page selection');
equal(manyUI.mapSelection().visible.length,40,'Map is bounded to forty models');
equal((manyUI.mapResultsHTML().match(/class="matrix-cell /g)||[]).length,1600,'Map DOM is bounded to forty squared cells');
check(manyUI.mapResultsHTML().includes('Showing 1-40 of 86'),'Map slice scope is explicit');
manyUI.state.mapPage = 3;
equal(manyUI.mapSelection().visible.length,6,'Last map slice is complete');
manyUI.state.mapSearch = 'Inventory';
equal(manyUI.mapSelection().visible.length,1,'Map search clamps stale slice selection');
equal(manyUI.state.mapPage,1,'Map pagination is reset within bounds');

const stress = structuredClone(fixture);
stress.models = {}; stress.modelList = []; stress.allPairs = [];
for(let index=0;index<250;index++){
  const id='stress-'+index;
  stress.models[id]={...fixture.models['demo-sales'],name:'Model '+index,workspaceId:'workspace-'+index%5,workspace:'Workspace '+index%5};
  stress.modelList.push({id,name:'Model '+index,workspace:'Workspace '+index%5});
}
for(let first=0;first<250;first++){
  for(let second=first+1;second<250&&stress.allPairs.length<20000;second++){
    stress.allPairs.push({...fixture.allPairs[0],idA:'stress-'+first,idB:'stress-'+second});
  }
}
const stressStart=performance.now();
const stressUI=allScope(stress);
equal(stressUI.reviewSelection().rows.length,20000,'Large catalog retains every saved candidate');
equal((stressUI.reviewQueueHTML().match(/data-pair-key=/g)||[]).length,25,'Large catalog table has bounded rows');
equal((stressUI.mapResultsHTML().match(/class="matrix-cell /g)||[]).length,1600,'Large catalog map has bounded cells');
const stressMs=Math.round(performance.now()-stressStart);

const defaultUI = create();
equal(defaultUI.state.crossOnly,false,'Cross-workspace scope defaults off');
equal(defaultUI.candidates().length,8,'All-workspace candidates included by default');
check(!defaultUI.tabsHTML().includes('data-cross-only checked'),'Scope checkbox starts unchecked');
check(defaultUI.reviewQueueHTML().includes('>Overall<span'),'Table labels the existing combined score Overall');
check(defaultUI.compareHTML().includes('>Overall</dt>'),'Compare uses the Overall label');
check(defaultUI.helpHTML().includes('<strong>Overall</strong>'),'Definitions use the Overall label');
check(defaultUI.mapHTML().includes('Overall similarity map'),'Map uses the Overall label');
defaultUI.setComparisonScope(true);
equal(defaultUI.candidates().length,0,'Enabling scope excludes same-workspace candidates');
equal(defaultUI.buildGroups().length,0,'Single-workspace duplicate groups excluded');
check(defaultUI.groupResultsHTML().includes('No cross-workspace duplicate groups at this cutoff'),'Scoped-empty Groups is explicit');
check(defaultUI.reviewQueueHTML().includes('No cross-workspace candidates'),'Scoped-empty Review is explicit');
check(defaultUI.tabsHTML().includes('data-cross-only checked'),'Shared scope control is outside view filters');
check(defaultUI.reviewHTML().includes('<strong>6</strong><span>Catalog models'),'Scope does not shrink catalog model total');
equal((defaultUI.mapResultsHTML().match(/class="matrix-cell outside"/g)||[]).length,20,'Same-workspace matrix cells are outside scope');
equal((defaultUI.mapResultsHTML().match(/class="matrix-cell unscored"/g)||[]).length,10,'Eligible unscored pairs remain distinct from excluded pairs');
check(defaultUI.mapResultsHTML().includes('aria-disabled="true"'),'Excluded cells are explicitly disabled');
check(defaultUI.compareHTML().includes('Outside scope: Same workspace'),'Manual comparison retains out-of-scope context');
Object.assign(defaultUI.state,{search:'Sales',workspace:'demo-retail',security:'different',filter:'duplicate',page:3});
defaultUI.clearReviewFilters();
equal(defaultUI.state.crossOnly,true,'Clear filters preserves report scope');
equal([defaultUI.state.search,defaultUI.state.workspace,defaultUI.state.security,defaultUI.state.filter,defaultUI.state.page],['','all','all','all',1],'Clear resets only Review filters and page');
Object.assign(defaultUI.state,{groupSearch:'Sales',mapSearch:'Inventory',page:3,mapPage:2});
defaultUI.setComparisonScope(false);
equal([defaultUI.state.groupSearch,defaultUI.state.mapSearch],['Sales','Inventory'],'Scope toggle retains independent view searches');
equal([defaultUI.state.page,defaultUI.state.mapPage],[1,1],'Scope toggle resets stale pages');
equal(defaultUI.candidates().length,8,'Disabling scope restores all saved candidates');
equal(defaultUI.buildGroups().length,1,'Disabling scope restores original groups');
equal(create().state.crossOnly,false,'Fresh render defaults off independently of previous view state');

const scoped = structuredClone(fixture);
for(const model of Object.values(scoped.models)) { model.workspaceId='workspace-a'; model.workspace='Same name'; }
scoped.models['demo-sales-east'].workspaceId='workspace-b';
const crossUI=crossScope(scoped);
equal(crossUI.candidates().length,4,'ID-based scope ignores stale crossWorkspace booleans and equal names');
equal(crossUI.buildGroups().length,1,'Cross-workspace duplicate connects a group');
check(crossUI.reviewHTML().includes('<strong>4</strong><span>Cross-workspace pairs'),'Summary and scoped pair rows agree');
check(crossUI.groupResultsHTML().includes('<td>2</td><td>2</td>'),'Group workspace count uses distinct IDs');
crossUI.state.workspace='workspace-b';
equal(crossUI.reviewSelection().rows.length,4,'Either-endpoint workspace filter still applies');
crossUI.state.security='different';
equal(crossUI.reviewSelection().counts,{duplicate:1,containment:1,overlap:1},'Scoped category counts share local filter pipeline');

const normalized=structuredClone(scoped);
normalized.models['demo-sales-east'].workspaceId=' WORKSPACE-A ';
equal(crossScope(normalized).candidates().length,0,'Workspace IDs normalize whitespace and case');
normalized.models['demo-sales-east'].workspaceId='';
const missingUI=crossScope(normalized);
equal(missingUI.candidates().length,0,'Missing IDs cannot prove a cross-workspace pair');
check(missingUI.reviewHTML().includes('Workspace unknown: 1 model</span>'),'Missing identity remains visible');
check(missingUI.mapResultsHTML().includes('Outside scope (Workspace unknown)'),'Unknown identity map state is not Not scored or zero');
const zeroCross=structuredClone(scoped);
zeroCross.allPairs[0].combined=0;
check(crossScope(zeroCross).mapResultsHTML().includes('>0%</button>'),'Eligible cross-workspace zero remains a measured value');

const triangle=structuredClone(scoped);
triangle.allPairs=[
  {...fixture.allPairs[0],idA:'demo-sales',idB:'demo-sales-east',combined:.96},
  {...fixture.allPairs[0],idA:'demo-sales-core',idB:'demo-sales-east',combined:.97},
  {...fixture.allPairs[0],idA:'demo-sales',idB:'demo-sales-core',combined:1},
];
const triangleUI=crossScope(triangle),triangleGroup=triangleUI.buildGroups()[0];
equal(triangleGroup.members.length,3,'Same-workspace members can connect through cross-workspace links');
equal(triangleGroup.strongest.combined,.97,'Same-workspace 100% pair cannot set scoped group maximum');
check(triangleGroup.securityDifferent,'All-member security warning survives scope');
triangleUI.groupResultsHTML();
const triangleKey=triangleUI.groupKey(triangleGroup);
equal(triangleUI.state.groupSelections[triangleKey],{a:'demo-sales-core',b:'demo-sales-east'},'Default group comparison uses strongest eligible pair');
triangleUI.state.groupSelections[triangleKey]={a:'demo-sales',b:'demo-sales-core'};
equal(triangleUI.groupSelection(triangleGroup).chosen,{a:'demo-sales',b:'demo-sales-east'},'Group selection repairs an excluded second model');
equal(triangleUI.groupSelection(triangleGroup).options,['demo-sales-east'],'Group Model B offers only distinct in-scope models');
triangleUI.setComparisonScope(false);
equal(triangleUI.buildGroups()[0].strongest.combined,1,'All-workspace scope restores original maximum');

const bridge=structuredClone(scoped);
bridge.models['demo-sales-core'].workspaceId='workspace-b';
bridge.models['demo-sales-forecast'].workspaceId='workspace-c';
bridge.allPairs=[
  {...fixture.allPairs[0],idA:'demo-sales',idB:'demo-sales-east',combined:.96},
  {...fixture.allPairs[0],idA:'demo-sales-east',idB:'demo-sales-core',combined:1},
  {...fixture.allPairs[0],idA:'demo-sales-core',idB:'demo-sales-forecast',combined:.97},
];
const bridgeUI=crossScope(bridge);
equal(bridgeUI.buildGroups().map(group=>group.members.length),[2,2],'Removing a same-workspace bridge splits the duplicate graph');
bridgeUI.setComparisonScope(false);
equal(bridgeUI.buildGroups().map(group=>group.members.length),[4],'All-workspace scope retains the full connected component');

const pq=allScope();
pq.state.powerQuery='differs';
equal(pq.reviewSelection().rows.map(item=>[item.pair.idA,item.pair.idB].sort().join('|')).sort(),
  JSON.parse(JSON.stringify(pq.candidates().filter(item=>item.pair.powerQueryStatus==='one_sided'||(item.pair.powerQueryStatus==='compared'&&item.pair.powerQuery<1)).map(item=>[item.pair.idA,item.pair.idB].sort().join('|')).sort())),
  'Power Query "differs" keeps one-sided and changed M');
pq.state.powerQuery='matches';
equal(pq.reviewSelection().rows.map(item=>item.pair.idB),['demo-sales-east'],'Power Query "matches" keeps identical M');
pq.state.powerQuery='not_applicable';
check(pq.reviewSelection().rows.every(item=>item.pair.powerQueryStatus==='not_applicable'),'No-M filter keeps only pairs without M');
pq.state.powerQuery='all';
pq.state.cmpA='demo-sales';pq.state.cmpB='demo-sales-forecast';pq.state.cmpDiffOnly=true;
const pqCompare=pq.compareHTML();
check(pqCompare.includes('data-section="queries"'),'Compare includes a Power Query section');
check(/Power Query<\/span><span class="muted">1 matching \/ 1 different/.test(pqCompare),'Power Query section counts matching and changed queries');
check(pqCompare.includes('Table.SelectRows')&&pqCompare.includes('M query'),'Changed M is shown side by side');
pq.state.cmpB='demo-sales-core';
check(/Power Query<\/span><span class="muted">0 matching \/ 2 different/.test(pq.compareHTML()),'Queries only in one model are differences');
const naPair=fixture.allPairs.find(pair=>pair.powerQueryStatus==='not_applicable');
pq.state.expandedPairs={};pq.state.expandedPairs[[naPair.idA,naPair.idB].sort().join('|')]=true;
check(pq.helpHTML().includes('Power Query (M)'),'Definitions explain the Power Query signal');
stressUI.setComparisonScope(true);
equal(stressUI.candidates().length,stress.allPairs.filter(pair=>stress.models[pair.idA].workspaceId!==stress.models[pair.idB].workspaceId).length,'Large-catalog scope counts only eligible saved pairs');
console.log(JSON.stringify({status:'PASS',assertions,stress:{models:250,pairs:20000,elapsedMs:stressMs}}));