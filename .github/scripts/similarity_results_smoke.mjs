import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [previewPath, outputPath, baselinePath] = process.argv.slice(2);
assert(previewPath && outputPath, 'Usage: node similarity_results_smoke.mjs PREVIEW OUTPUT [BASELINE]');
const output = path.resolve(outputPath);
await mkdir(output, {recursive:true});
const profile = await mkdtemp(path.join(output, 'chrome-profile-'));
const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
await access(chromePath);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=0', '--window-size=1440,1000',
  '--force-device-scale-factor=2', `--user-data-dir=${profile}`, 'about:blank',
], {stdio:['ignore','ignore','pipe']});

let socket;
try {
  const endpoint = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome endpoint unavailable')),15000);
    let log = '';
    chrome.once('error',reject);
    chrome.stderr.on('data',chunk => {
      log += chunk.toString();
      const found = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if(found){clearTimeout(timer);resolve(found[1]);}
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve,reject) => {
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let sequence = 0;
  const pending = new Map(), browserErrors = [];
  socket.addEventListener('message',event => {
    const message = JSON.parse(event.data);
    if(message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    if(message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args);
    const request = pending.get(message.id);
    if(!request)return;
    pending.delete(message.id);clearTimeout(request.timer);
    if(message.error)request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function send(method,params={},sessionId){
    return new Promise((resolve,reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {pending.delete(id);reject(new Error('Timed out: '+method));},15000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  const {targetId} = await send('Target.createTarget',{url:'about:blank'});
  const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
  const command = (method,params={}) => send(method,params,sessionId);
  async function evaluate(expression){
    const result = await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const settle = () => evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
  async function navigate(file){
    await command('Page.navigate',{url:pathToFileURL(path.resolve(file)).href});
    await evaluate('new Promise(resolve=>document.readyState==="complete"?resolve():window.addEventListener("load",resolve,{once:true}))');
    await settle();
  }
  async function click(selector){
    const rect = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing control: '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest',inline:'nearest'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...rect});
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
    await settle();
  }
  async function change(selector,value){
    await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    await settle();
  }
  async function key(keyName){
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:keyName});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:keyName});
    await settle();
  }
  async function viewport(width,height,scale=2){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    await settle();
  }
  async function metrics(){
    return evaluate(`(()=>{
      const root=document.querySelector('#sms-app'),rows=[...root.querySelectorAll('[data-pair-key],.candidate')];
      const selector='.intro,.subtitle,.plain,.caution,.foot,.report-banner';
      const prose=[...root.querySelectorAll(selector)].filter(node=>node.getClientRects().length&&!node.parentElement.closest(selector)).map(node=>node.innerText).join(' ');
      return {width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,view:root.querySelector('[aria-selected=true]').dataset.tab,
        words:root.innerText.split(/\\s+/).filter(Boolean).length,proseWords:prose.split(/\\s+/).filter(Boolean).length,
        firstRow:rows[0]?.getBoundingClientRect().top,completeRows:rows.filter(node=>node.getBoundingClientRect().bottom<=innerHeight).length,
        pageOverflow:document.documentElement.scrollWidth>innerWidth,modelNames:[...root.querySelectorAll('.pair-table .model-name')].map(node=>node.textContent)};
    })()`);
  }
  async function tableStyleCheck(tableSelector){
    const result=await evaluate(`(()=>{
      const table=document.querySelector(${JSON.stringify(tableSelector)});
      function luminance(color){const text=color.trim();const channels=text.startsWith('#')?text.slice(1).match(/../g).map(value=>parseInt(value,16)):text.match(/[\\d.]+/g).slice(0,3).map(Number);const values=channels.map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
      function contrast(first,second){const values=[luminance(first),luminance(second)].sort((left,right)=>right-left);return(values[0]+.05)/(values[1]+.05);}
      const contrasts=[...table.querySelectorAll('th,td .model-name,td .workspace,td .cell-value,td .finding-label,td .security-tag,td .status-link')].map(element=>contrast(getComputedStyle(element).color,getComputedStyle(element.closest('th,td')).backgroundColor));
      const headers=[...table.querySelectorAll('thead th')],cells=[...table.querySelectorAll('tbody tr:first-child td')];
      const starts=elements=>elements.map(element=>{const node=element.querySelector('.table-sort,.model-name,.cell-value,.status-link')||element;const box=node.getBoundingClientRect();return box.left+parseFloat(getComputedStyle(node).paddingLeft);});
      const headerStarts=starts(headers),cellStarts=starts(cells);
      const focus=table.querySelector('button'),focusBackground=getComputedStyle(focus.closest('td,th')).backgroundColor;
      return{minimumContrast:Math.min(...contrasts),opaque:[...table.querySelectorAll('th,td')].every(element=>!getComputedStyle(element).backgroundColor.startsWith('rgba')),
        aligned:[...table.querySelectorAll('th,td,.table-sort')].every(element=>getComputedStyle(element).textAlign==='left'),
        headerOffsets:(table.matches('.pair-table')?headerStarts.slice(0,-1):headerStarts).map((value,index)=>Math.abs(value-cellStarts[index])),focusContrast:contrast(getComputedStyle(focus).getPropertyValue('--cp-accent'),focusBackground)};
    })()`);
    assert(result.minimumContrast>=4.5,'Readable table text: '+JSON.stringify(result));
    assert(result.focusContrast>=3,'Visible focus indicator');
    assert(result.opaque&&result.aligned,'Host table styles cannot bleed through');
    assert(result.headerOffsets.every(offset=>offset<1),'Headers align with their cell text');
    return result;
  }
  const captures=[], layouts=[];
  async function capture(name){
    await settle();
    const state = await metrics();
    assert.equal(state.pageOverflow,false);
    const {data} = await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const png=Buffer.from(data,'base64');
    const scale=await evaluate('devicePixelRatio');
    assert.equal(png.readUInt32BE(16),Math.round(state.width*scale));
    assert.equal(png.readUInt32BE(20),Math.round(state.height*scale));
    assert(png.length>12000,'Unexpectedly small screenshot');
    await writeFile(path.join(output,name+'.png'),png);
    captures.push({name,bytes:png.length,pixelWidth:png.readUInt32BE(16),pixelHeight:png.readUInt32BE(20),...state});
  }
  await command('Page.enable');await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await navigate(previewPath);
  assert(await evaluate('!document.querySelector("[data-cross-only]").checked'),'Cross-workspace scope defaults off');
  assert(await evaluate('document.querySelector("[data-sort=combined]").textContent.startsWith("Overall")'),'Overall is the displayed score label');
  await click('[data-cross-only]');
  assert.equal(await evaluate('document.querySelectorAll("[data-pair-key]").length'),0,'Same-workspace candidates excluded initially');
  await click('[data-clear-filters]');
  assert(await evaluate('document.querySelector("[data-cross-only]").checked'),'Clear filters retains comparison scope');
  await click('[data-tab=groups]');
  assert(await evaluate('document.querySelector("#group-results").textContent.includes("No cross-workspace duplicate groups")'),'Groups follow shared scope');
  await click('[data-tab=map]');
  assert.equal(await evaluate('document.querySelectorAll("[data-map-excluded]").length'),20);
  await click('[data-map-excluded]');
  assert.equal(await evaluate('document.querySelector("[aria-selected=true]").dataset.tab'),'map','Excluded cell cannot drill through');
  assert(await evaluate('document.querySelector(".map-detail").textContent.includes("Outside scope")'),'Excluded state is keyboard/touch inspectable');
  await click('[data-map-a="demo-sales"][data-map-b="demo-inventory"]');
  await click('[data-back]');
  assert(await evaluate('document.querySelector("[data-cross-only]").checked'),'Cross-workspace map drill-through preserves scope');
  await click('[data-cross-only]');
  assert.equal(await evaluate('document.querySelectorAll("[data-map-excluded]").length'),0,'Map restores same-workspace cells when scope is off');
  await click('[data-tab=review]');
  await capture('review-desktop');
  const review=await metrics();
  assert(review.firstRow<=320&&review.completeRows>=6,'Desktop density target');
  assert(await evaluate('[...document.querySelectorAll(".status-link.warning")].every(element=>getComputedStyle(element).borderRadius==="0px")'),'Warning marker is a straight border');
  await click('[data-pair-key] td:nth-child(2)');
  assert.equal(await evaluate('document.querySelector("[aria-selected=true]").dataset.tab'),'review','Row click stays on Review');
  assert.equal(await evaluate('document.querySelectorAll(".pair-details:not([hidden]) [role=meter]").length'),6,'Row click expands the six schema indicators');
  await click('[data-pair-key] [data-compare-a]');
  assert.equal(await evaluate('document.querySelector("[aria-selected=true]").dataset.tab'),'compare','Only the arrow opens the schema comparison');
  await click('[data-back]');
  assert(await evaluate('document.querySelector("[data-expand-pair]").getAttribute("aria-expanded")==="true"'),'Back preserves the expanded pair');
  await click('[data-pair-key] td:nth-child(2)');
  assert.equal(await evaluate('document.querySelectorAll(".pair-details:not([hidden])").length'),0,'Second row click collapses its indicators');
  await evaluate('document.querySelector("[data-expand-pair]").focus({preventScroll:true})');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert(await evaluate('document.querySelector("[data-expand-pair]").getAttribute("aria-expanded")==="true"'),'Keyboard activates the disclosure');
  await click('[data-expand-pair]');
  await change('[data-review-filter=security]','different');
  assert.equal(await evaluate('document.querySelectorAll("[data-pair-key]").length'),3);
  await click('[data-compare-a="demo-sales"][data-compare-b="demo-sales-east"]');
  assert.equal(await evaluate('document.querySelector("#section-reports").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#section-security").hidden'),false);
  const comparison=await metrics();
  await capture('compare-desktop');
  await click('#section-security details summary');
  assert(await evaluate('document.querySelector("#section-security details").open'));
  await click('[data-help]');await key('Escape');
  assert(await evaluate('!document.querySelector("#sms-help").open'),'Escape closes Help');
  assert(await evaluate('document.activeElement.matches("[data-help]")'),'Help returns focus');
  await click('[data-swap]');
  assert.equal(await evaluate('document.querySelector("[data-compare-select=a]").value'),'demo-sales-east');
  await click('[data-back]');
  assert.equal(await evaluate('document.querySelector("[data-review-filter=security]").value'),'different');
  assert(await evaluate('document.activeElement.matches("[data-compare-a]")'),'Back returns pair focus');
  await click('[data-clear-filters]');
  await click('[data-tab=groups]');await capture('groups-desktop');
  assert.equal(await evaluate('document.querySelectorAll(".group-members li").length'),2);
  await change('[data-group-search]','restricted');
  await click('[data-group-compare]');await click('[data-back]');
  assert.equal(await evaluate('document.querySelector("[data-group-search]").value'),'restricted');
  await click('[data-tab=map]');await capture('similarity-map-desktop');
  assert.equal(await evaluate('document.querySelectorAll(".matrix-cell.unscored").length'),10);
  assert.equal(await evaluate('document.querySelectorAll(".matrix-cell.unavailable").length'),8);
  await click('[data-map-a="demo-sales"][data-map-b="demo-inventory"]');
  assert.equal(await evaluate('document.querySelector(".finding-label").innerText'),'Not scored');
  await click('[data-back]');
  assert(await evaluate('document.activeElement.matches("[data-map-a=demo-sales][data-map-b=demo-inventory]")'));
  await click('[data-tab=review]');await click('[data-settings]');
  await change('[data-draft-number=duplicate]','');await click('[data-apply]');
  assert(await evaluate('!document.querySelector("#threshold-error").hidden'),'Invalid threshold is visible');
  await click('[data-reset]');
  assert.equal(await evaluate('document.querySelector("[data-draft-number=duplicate]").value'),'95');
  await change('[data-draft-number=duplicate]','99');await click('[data-apply]');
  assert.equal(await evaluate('document.querySelectorAll(".stat strong")[2].textContent'),'0');
  await click('[data-reset]');await click('[data-settings]');

  for(const theme of ['dark','light']){
    if(await evaluate('document.documentElement.dataset.theme')!==theme)await click('[data-theme-set='+theme+']');
    for(const width of [1440,1280,768,390]){
      await viewport(width,width===1280?800:1000);
      for(const tab of ['review','compare','groups','map']){
        await click('[data-tab='+tab+']');
        const state=await metrics();layouts.push(state);
        assert.equal(state.pageOverflow,false,theme+'/'+width+'/'+tab);
        if(tab==='review')assert(await evaluate('[...document.querySelectorAll(".pair-table .icon-button")].every(node=>node.getBoundingClientRect().width>=33.9)'),'Stable Compare button width');
        if(tab==='review'&&width>=1280){assert(state.firstRow<=320);assert(state.completeRows>=6);}
      }
    }
    await click('[data-tab=review]');await capture('review-mobile-'+theme);
    await click('[data-compare-a="demo-sales"][data-compare-b="demo-sales-east"]');await capture('compare-mobile-'+theme);
  }

  await viewport(1440,1000);
  await click('[data-tab=review]');
  await evaluate(`document.querySelectorAll('.pair-table .model-name').forEach(element=>element.textContent='LongUnbrokenModelName_'+ 'X'.repeat(200))`);
  assert(!(await metrics()).pageOverflow,'Long model names fit table identities');
  await viewport(390,1000);
  assert(!(await metrics()).pageOverflow,'Long table names do not overflow the mobile page');
  await click('[data-compare-a="demo-sales"][data-compare-b="demo-sales-east"]');
  await evaluate(`document.querySelectorAll('.rule-row .status,.security-detail').forEach(element=>element.textContent='LongUnbrokenModelName_'+ 'X'.repeat(200))`);
  assert(!(await metrics()).pageOverflow,'Long model names and security targets wrap on mobile');
  await viewport(1440,1000);
  await click('[data-tab=review]');
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent='dt{width:160px;float:left}dd{margin-left:170px;max-width:90px}';document.head.append(style);})()`);
  await click('[data-compare-a="demo-sales"][data-compare-b="demo-sales-east"]');
  assert(await evaluate('[...document.querySelectorAll(".coverage-list dd,.evidence-item dd")].filter(node=>node.getClientRects().length).every(node=>getComputedStyle(node).float==="none"&&getComputedStyle(node).maxWidth==="none")'),'Host definition-list styles are reset');
  await command('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  assert(await evaluate('document.querySelector(".compare-controls").getBoundingClientRect().width<=document.querySelector("#sms-app").getBoundingClientRect().width'),'Zoom does not enlarge controls past app');
  await command('Emulation.setPageScaleFactor',{pageScaleFactor:1});

  const tableStyles=[];
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent='table td{text-align:right;color:#000}tbody tr:nth-child(odd),tbody tr:hover{background:#f3f2f1}';document.head.append(style);})()`);
  for(const theme of ['light','dark']){
    if(await evaluate('document.documentElement.dataset.theme')!==theme)await click('[data-theme-set='+theme+']');
    await click('[data-tab=review]');
    tableStyles.push({theme,state:'normal',...await tableStyleCheck('.pair-table')});
    const point=await evaluate('(()=>{const bounds=document.querySelector("[data-pair-key]").getBoundingClientRect();return{x:bounds.x+40,y:bounds.y+bounds.height/2};})()');
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await settle();
    assert(await evaluate('document.querySelector("[data-pair-key]").matches(":hover")'),'Native hover reaches the row');
    tableStyles.push({theme,state:'hover',...await tableStyleCheck('.pair-table')});
    await evaluate('document.querySelector("[data-compare-a]").focus({preventScroll:true})');
    tableStyles.push({theme,state:'focus',...await tableStyleCheck('.pair-table')});
    await click('[data-tab=groups]');
    tableStyles.push({theme,state:'selected',...await tableStyleCheck('.group-table')});
  }

  const previewHTML=(await readFile(path.resolve(previewPath),'utf8')).replace(/\r\n/g,'\n');
  const dataPrefix='var DATA = ',dataSuffix=';\n  var root =';
  assert.equal(previewHTML.split(dataPrefix).length,2,'Single embedded results payload');
  const dataStart=previewHTML.indexOf(dataPrefix)+dataPrefix.length,dataEnd=previewHTML.indexOf(dataSuffix,dataStart);
  assert(dataEnd>dataStart,'Known results payload boundary');
  const crossFixture=JSON.parse(previewHTML.slice(dataStart,dataEnd));
  Object.assign(crossFixture.models['demo-sales-east'],{workspaceId:'demo-retail-east',workspace:'Demo Retail East'});
  Object.assign(crossFixture.modelList.find(model=>model.id==='demo-sales-east'),{workspaceId:'demo-retail-east',workspace:'Demo Retail East'});
  for(const pair of crossFixture.allPairs){
    pair.workspaceA=crossFixture.models[pair.idA].workspace;pair.workspaceB=crossFixture.models[pair.idB].workspace;
    pair.crossWorkspace=crossFixture.models[pair.idA].workspaceId!==crossFixture.models[pair.idB].workspaceId;
  }
  for(const report of crossFixture.reportDependencies.byModel['demo-sales-east'])report.crossWorkspace=true;
  const crossPath=path.join(output,'cross-workspace.html');
  await writeFile(crossPath,previewHTML.slice(0,dataStart)+JSON.stringify(crossFixture).replace(/</g,'\\u003c')+previewHTML.slice(dataEnd));
  await navigate(crossPath);
  if(await evaluate('document.documentElement.dataset.theme')!=='light')await click('[data-theme-set=light]');
  await click('[data-cross-only]');
  assert(await evaluate('document.querySelector("[data-cross-only]").checked'),'Cross-workspace scope can be enabled');
  assert.equal(await evaluate('document.querySelectorAll("[data-pair-key]").length'),4);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".stat strong")].map(element=>element.textContent)'),['6','4','1'],'Summary agrees with eligible pair/group population');
  await capture('cross-workspace-review-light');
  await click('[data-tab=groups]');
  assert.equal(await evaluate('document.querySelector(".group-table tbody tr td:nth-child(3)").textContent'),'2','Scoped group spans two IDs');
  await change('[data-group-side=a]','demo-sales-east');
  assert.deepEqual(await evaluate('[...document.querySelector("[data-group-side=b]").options].map(option=>option.value)'),['demo-sales'],'Group picker restricts Model B to the other workspace');
  await click('[data-group-compare]');
  assert.equal(await evaluate('document.querySelector("[data-compare-select=a]").value'),'demo-sales-east');
  assert.equal(await evaluate('document.querySelector("[data-compare-select=b]").value'),'demo-sales');
  await click('[data-back]');
  assert(await evaluate('document.querySelector("[data-cross-only]").checked'),'Group Back preserves shared scope');
  await click('[data-tab=map]');
  assert.equal(await evaluate('document.querySelectorAll("[data-map-excluded]").length'),12);
  await click('[data-cross-only]');await click('[data-tab=review]');
  assert.equal(await evaluate('document.querySelectorAll("[data-pair-key]").length'),8,'Scope toggle restores all pairs from another view');

  const embeddedPath=path.join(output,'embedded.html');
  const previewJSON=JSON.stringify(previewHTML).replace(/</g,'\\u003c');
  await writeFile(embeddedPath,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Embedded results regression</title>
    <style>body{margin:0}header{height:64px}#notebook{height:calc(100vh - 96px);overflow:auto}.spacer{height:480px}iframe{display:block;width:100%;height:600px;border:0}</style>
    <header>Notebook output regression</header><div id="notebook"><div class="spacer"></div><iframe id="output" title="Results output"></iframe><div class="spacer"></div></div>
    <script>const frame=document.querySelector('#output');window.resizeCount=0;frame.addEventListener('load',()=>{
      const resize=()=>{if(++window.resizeCount>60){window.resizeLoop=true;return;}frame.style.height=frame.contentDocument.body.scrollHeight+'px';};
      new ResizeObserver(resize).observe(frame.contentDocument.body);resize();window.outputReady=true;
    });frame.srcdoc=${previewJSON};</script></html>`);
  await navigate(embeddedPath);
  const embedded=[];
  async function embeddedSettle(){
    await evaluate(`new Promise((resolve,reject)=>{let previous='',stable=0,attempts=0;function inspect(){
      const frame=document.querySelector('#output');if(window.resizeLoop){reject(new Error('Output height resize loop'));return;}
      const size=window.outputReady?frame.style.height+'|'+frame.contentDocument.body.scrollHeight:'';
      stable=size&&size===previous?stable+1:0;previous=size;
      if(stable>=4){resolve();return;}if(++attempts>120){reject(new Error('Output height did not stabilize'));return;}requestAnimationFrame(inspect);
    }inspect();})`);
  }
  async function embeddedClick(selector){
    const point=await evaluate(`(()=>{const frame=document.querySelector('#output'),control=frame.contentDocument.querySelector(${JSON.stringify(selector)});if(!control)throw new Error('Missing embedded control');control.scrollIntoView({block:'nearest',inline:'nearest'});const parent=frame.getBoundingClientRect(),rect=control.getBoundingClientRect();return{x:parent.x+rect.x+rect.width/2,y:parent.y+rect.y+rect.height/2};})()`);
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await settle();
  }
  for(const width of [1280,390]){
    await viewport(width,900);await embeddedSettle();
    await evaluate(`(()=>{const pane=document.querySelector('#notebook');pane.scrollTop=document.querySelector('#output').offsetTop-pane.offsetTop;})()`);
    if(await evaluate('document.querySelector("#output").contentDocument.querySelector("[data-cross-only]").checked'))await embeddedClick('[data-cross-only]');
    await embeddedSettle();
    const before=await evaluate('document.querySelector("#notebook").scrollTop');
    await embeddedClick('.status-strip [data-help]:last-child');
    const state=await evaluate(`(()=>{const frame=document.querySelector('#output'),pane=document.querySelector('#notebook'),dialog=frame.contentDocument.querySelector('#sms-help');const outer=frame.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),visible=pane.getBoundingClientRect();return{width:innerWidth,frameHeight:frame.clientHeight,open:dialog.open,dialogTop:outer.top+bounds.top,dialogBottom:outer.top+bounds.bottom,dialogLeft:outer.left+bounds.left,dialogRight:outer.left+bounds.right,visibleTop:visible.top,visibleBottom:visible.bottom,parentScroll:pane.scrollTop,focus:frame.contentDocument.activeElement.getAttribute('aria-label')};})()`);
    assert(state.open,'Embedded Scan details opens');
    assert.equal(state.parentScroll,before,'Opening Help preserves notebook scroll');
    assert(state.dialogTop>=state.visibleTop&&state.dialogBottom<=state.visibleBottom,'Help stays inside the visible notebook output');
    assert(state.dialogLeft>=0&&state.dialogRight<=width,'Help stays within the horizontal viewport');
    assert.equal(state.focus,'Close definitions');
    await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:(state.dialogLeft+state.dialogRight)/2,y:(state.dialogTop+state.dialogBottom)/2,deltaY:420,deltaX:0});
    await settle();
    assert(await evaluate('document.querySelector("#output").contentDocument.querySelector("#sms-help").scrollTop>0'),'Help scrolls internally');
    assert.equal(await evaluate('document.querySelector("#notebook").scrollTop'),before,'Help wheel does not scroll the notebook');
    await embeddedClick('[data-help-close]');
    assert(await evaluate('!document.querySelector("#output").contentDocument.querySelector("#sms-help").open'),'Sticky close button works after scrolling');
    assert(await evaluate('document.querySelector("#output").contentDocument.activeElement.matches(".status-strip [data-help]:last-child")'),'Closing Help restores its trigger focus');
    await embeddedClick('.status-strip [data-help]:last-child');
    assert.equal(await evaluate('document.querySelector("#output").contentDocument.querySelector("#sms-help").scrollTop'),0,'Reopening starts at the Help heading');
    await key('Escape');
    assert(await evaluate('!document.querySelector("#output").contentDocument.querySelector("#sms-help").open'),'Embedded Escape closes Help');
    assert.equal(await evaluate('document.querySelector("#notebook").scrollTop'),before,'Closing Help preserves notebook scroll');
    await evaluate('document.querySelector("#notebook").style.height="400px"');
    await embeddedClick(':nth-last-child(1 of [data-pair-key]) [data-compare-a]');
    await embeddedSettle();
    await embeddedClick('[data-back]');
    await embeddedSettle();
    const returned=await evaluate(`new Promise(resolve=>{const frame=document.querySelector('#output'),control=frame.contentDocument.activeElement;const observer=new frame.contentWindow.IntersectionObserver(entries=>{observer.disconnect();resolve({ratio:entries[0].intersectionRatio,isPair:control.matches('[data-compare-a]')});});observer.observe(control);})`);
    assert(returned.isPair&&returned.ratio>.99,'Embedded Back reveals the selected pair');
    await evaluate('document.querySelector("#notebook").style.height=""');
    embedded.push(state);
  }

  let baseline;
  if(baselinePath){
    await navigate(baselinePath);
    const baselineReview=await metrics();
    await click('[data-compare-a="demo-sales"][data-compare-b="demo-sales-east"]');
    const baselineCompare=await metrics();
    assert(review.proseWords<=baselineReview.proseWords*.4,'Review explanatory-copy reduction');
    assert(comparison.proseWords<=baselineCompare.proseWords*.4,'Compare explanatory-copy reduction');
    baseline={review:baselineReview,compare:baselineCompare};
  }
  assert.deepEqual(browserErrors,[]);
  const evidence={status:'PASS',review,compare:comparison,baseline,layouts,captures,embedded,tableStyles,browserErrors,
    checks:['native click/drill-through/back','Help Escape/focus','group selection','unscored matrix drill-through','threshold validation/reset','both themes/four widths','long names and rules','stable icon button dimensions','host CSS isolation','pixel dimensions','copy and density targets','auto-sized notebook iframe stability','embedded Help bounds/internal scrolling/focus','embedded Back reveals selected pair','shared cross-workspace default/reset/navigation','disabled map exclusions','table contrast/opacity/header alignment','populated cross-workspace groups/pickers/counts']};
  await writeFile(path.join(output,'verification.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:evidence.status,review,compare:comparison,baseline,layouts:layouts.length,captures:captures.length,embedded,tableStyles,browserErrors,output},null,2));
  await send('Browser.close');
} finally {
  if(socket)socket.close();
  chrome.kill();
}