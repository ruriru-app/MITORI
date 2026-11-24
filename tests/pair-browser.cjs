// Run with the bundled playwright package on NODE_PATH. Uses an isolated browser profile.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1180,height:820}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
    state.grades=[{id:'g',name:'5年生',active:true}];state.sharedClasses=[{id:'c',name:'5年1組',gradeId:'g',school:'サンプル小学校'}];
    state.sharedClassData={c:{roster:{'1':{kanji:'サンプル児童A'},'2':{kanji:'サンプル児童B'},'3':{kanji:'サンプル児童C'}},positions:{},studentCount:3}};
    state.performanceTests=[{id:'legacy',name:'既存テスト',gradeId:'g',items:[{
      id:'legacy-item',perspective:'knowledge',content:'発表する',levels:[
        {id:'low',label:'1',score:1,criterion:'一部を伝えられる'},
        {id:'high',label:'2',score:2,criterion:'内容を伝えられる'}
      ]
    }]}];save();
    document.querySelectorAll('.modalBack').forEach(node=>node.style.display='none');setMode('test');
  });
  await page.locator('#performancePairTab').click();
  assert.equal(await page.locator('.performanceTestCard').count(),0);
  await page.locator('#newPerformanceTestBtn').click();
  await page.locator('#performanceTestNameInput').fill('ペア対話テスト');
  const names=page.locator('#pairRoleEditor input');await names.nth(0).fill('お店屋さん');await names.nth(1).fill('お客さん');
  // Populate user-configurable criteria through the editor controls.
  for(let i=0;i<2;i++){
    const card=page.locator('.performanceItemAccordion').nth(i);
    if(await card.locator('.performanceAccordionToggle').getAttribute('aria-expanded')!=='true')await card.locator('.performanceAccordionToggle').click();
    await card.locator('.performanceItemGrid input').fill(i===0?'必要な情報を伝える':'相手の話に応じる');
    for(let j=0;j<3;j++)await card.locator('.criteriaLevelRow input:last-child').nth(j).fill(['支援があればできる','おおむねできる','十分にできる'][j]);
  }
  await page.locator('#savePerformanceTestBtn').click();
  await page.getByRole('button',{name:'このテストを使う',exact:true}).click();
  await page.locator('.performanceClassCard').click();
  const header=page.locator('.app > .header');
  assert.equal(await header.isVisible(),false,'the app header should be hidden during pair scoring');
  await page.locator('.pairStudentSelect').nth(0).selectOption('1');
  await page.locator('.pairStudentSelect').nth(1).selectOption('2');
  assert.deepEqual(await page.locator('.pairPanel').first().locator('.scoreMatrix thead th').allTextContents(),[
    '評価内容','支援があればできる1点','おおむねできる2点','十分にできる3点'
  ]);
  await page.locator('.pairPanel').nth(0).locator('input[type=radio]').nth(2).check();
  await page.locator('.pairPanel').nth(1).locator('input[type=radio]').nth(1).check();
  await page.locator('.pairPanel').nth(0).getByRole('button',{name:'お客さん',exact:true}).click();
  await page.locator('.pairPanel').nth(0).locator('input[type=radio]').nth(1).check();
  await page.locator('.pairPanel').nth(1).getByRole('button',{name:'お店屋さん',exact:true}).click();
  await page.locator('.pairPanel').nth(1).locator('input[type=radio]').nth(0).check();
  await page.locator('.pairPanel').nth(0).getByRole('button',{name:'お店屋さん',exact:true}).click();
  await page.locator('.pairPanel').nth(1).getByRole('button',{name:'お客さん',exact:true}).click();
  const boxes=await page.locator('.pairPanel').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
  assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[1].x>boxes[0].x+boxes[0].width);assert.ok(boxes[0].height>400);
  const outputDir=path.resolve(root,'../outputs');fs.mkdirSync(outputDir,{recursive:true});
  const dismiss=page.getByRole('button',{name:'今はしない',exact:true});if(await dismiss.isVisible())await dismiss.click();
  await page.screenshot({path:path.join(outputDir,'mitori-pair-dialogue.png')});
  await page.locator('.pairPanel').nth(0).getByRole('button',{name:'個票PDF',exact:true}).click();
  const content=await page.locator('#performancePrintPreview .printResultContent').allTextContents();
  assert.deepEqual(content,['【お店屋さん】必要な情報を伝える','【お客さん】相手の話に応じる']);
  await page.screenshot({path:path.join(outputDir,'mitori-pair-return-sheet.png')});
  await page.locator('#closePerformancePrintBtn').click();
  await page.locator('#pairBackBtn').click();
  assert.equal(await header.isVisible(),true,'the app header should return after scoring');
  await page.reload();
  await page.evaluate(()=>{document.querySelectorAll('.modalBack').forEach(node=>node.style.display='none');setMode('test')});
  assert.equal(await page.locator('.performanceTestCard h3').innerText(),'既存テスト');
  await page.getByRole('button',{name:'このテストを使う',exact:true}).click();
  await page.locator('.performanceClassCard').click();
  await page.locator('#performanceRosterTab').click();
  await page.locator('.performanceRosterRow').first().click();
  assert.equal(await header.isVisible(),true);
  await page.locator('#performanceScoreItems .scoreMatrixRadio').last().check();
  assert.match(await page.locator('#performanceScoreSummary').innerText(),/2 \/ 2点/);
  await page.locator('#savePerformanceResultBtn').click();
  assert.equal(await page.locator('.performanceRosterRow').first().locator('.performanceRosterState').innerText(),'評価済');
  await page.locator('#performanceRunBackBtn').click();
  await page.locator('#performanceClassBackBtn').click();
  await page.locator('#performancePairTab').click();await page.getByRole('button',{name:'このテストを使う',exact:true}).click();await page.locator('.performanceClassCard').click();
  await page.locator('.pairStudentSelect').nth(0).selectOption('1');
  assert.equal(await page.locator('.pairPanel').nth(0).locator('input[type=radio]').nth(2).isChecked(),true);
  await page.locator('.pairPanel').nth(0).getByRole('button',{name:'お客さん',exact:true}).click();
  assert.equal(await page.locator('.pairPanel').nth(0).locator('input[type=radio]').nth(1).isChecked(),true);
  await page.setViewportSize({width:1024,height:768});
  assert.equal(await page.locator('.pairPanel').count(),2);
  await page.locator('.pairStudentSelect').nth(1).selectOption('2');
  const rows=await page.locator('.pairPanelTop').evaluateAll(tops=>tops.map(top=>{
    const controls=[...top.querySelectorAll('select,button')].map(node=>node.getBoundingClientRect());
    return controls.every(control=>Math.abs(control.top-controls[0].top)<1&&control.height===controls[0].height);
  }));
  assert.deepEqual(rows,[true,true],'each pupil and their role buttons must occupy one row');
  // Add a common criterion after both pupils already have saved role ratings.
  await page.locator('#pairBackBtn').click();
  await page.locator('#performanceClassBackBtn').click();
  await page.getByRole('button',{name:'編集',exact:true}).click();
  await page.locator('#addPerformanceItemBtn').click();
  const commonCard=page.locator('.performanceItemAccordion').last();
  const commonOption=commonCard.locator('.pairItemRole select option[value="common"]');
  assert.equal(await commonOption.textContent(),'共通');
  await commonCard.locator('.pairItemRole select').selectOption('common');
  await commonCard.locator('.performanceItemGrid input').fill('対話を続ける');
  for(let j=0;j<3;j++)await commonCard.locator('.criteriaLevelRow input:last-child').nth(j).fill(['支援があればできる','おおむねできる','十分にできる'][j]);
  await page.locator('#savePerformanceTestBtn').click();
  await page.getByRole('button',{name:'このテストを使う',exact:true}).click();
  await page.locator('.performanceClassCard').click();
  await page.locator('.pairStudentSelect').nth(0).selectOption('1');
  await page.locator('.pairStudentSelect').nth(1).selectOption('2');
  const panel=side=>page.locator('.pairPanel').nth(side);
  const scoreRow=(side,content)=>panel(side).locator('.scoreMatrix tbody tr').filter({hasText:content});
  const commonRow=side=>scoreRow(side,'【共通】対話を続ける');
  for(let side=0;side<2;side++){
    assert.equal(await panel(side).locator('.pairRoleSwitch button').count(),2,'common criteria must not introduce a third role tab');
    assert.equal(await commonRow(side).count(),1,'a common criterion must appear once in each role view');
    assert.equal(await commonRow(side).locator('input:checked').count(),0);
    assert.match(await panel(side).locator('.pairProgress').innerText(),/2\/3/,'adding common criteria must preserve existing role ratings');
  }
  assert.equal(await scoreRow(0,'必要な情報を伝える').locator('input').nth(2).isChecked(),true);
  assert.equal(await scoreRow(1,'相手の話に応じる').locator('input').nth(1).isChecked(),true);
  await commonRow(0).locator('input').nth(2).check();
  assert.match(await panel(0).locator('.pairTotal').innerText(),/8 \/ 9点/,'common scores and maxima must be counted once');
  assert.match(await panel(0).locator('.pairProgress').innerText(),/評価完了 3\/3/);
  assert.equal(await commonRow(1).locator('input:checked').count(),0,'one pupil must not inherit the other pupil common score');
  await panel(0).getByRole('button',{name:'お客さん',exact:true}).click();
  assert.equal(await commonRow(0).locator('input').nth(2).isChecked(),true,'common scores must be shared between the same pupil role views');
  assert.equal(await scoreRow(0,'相手の話に応じる').locator('input').nth(1).isChecked(),true);
  await commonRow(0).locator('input').nth(1).check();
  await panel(0).getByRole('button',{name:'お店屋さん',exact:true}).click();
  assert.equal(await commonRow(0).locator('input').nth(1).isChecked(),true);
  await commonRow(1).locator('input').nth(0).check();
  await panel(1).getByRole('button',{name:'お店屋さん',exact:true}).click();
  assert.equal(await commonRow(1).locator('input').nth(0).isChecked(),true);
  assert.equal(await scoreRow(1,'必要な情報を伝える').locator('input').nth(0).isChecked(),true);
  assert.equal(await commonRow(0).locator('input').nth(1).isChecked(),true,'editing pupil B must leave pupil A unchanged');
  assert.match(await panel(0).locator('.pairTotal').innerText(),/7 \/ 9点/);
  assert.match(await panel(1).locator('.pairTotal').innerText(),/4 \/ 9点/);
  await panel(0).getByRole('button',{name:'個票PDF',exact:true}).click();
  assert.deepEqual(await page.locator('#performancePrintPreview .printResultContent').allTextContents(),[
    '【お店屋さん】必要な情報を伝える','【お客さん】相手の話に応じる','【共通】対話を続ける'
  ],'the returned sheet must print each criterion once with its role or common prefix');
  assert.match(await page.locator('#performancePrintPreview .printScoreTotal').innerText(),/7 \/ 9点/);
  await page.locator('#closePerformancePrintBtn').click();
  await page.reload();
  await page.evaluate(()=>{document.querySelectorAll('.modalBack').forEach(node=>node.style.display='none');setMode('test')});
  await page.locator('#performancePairTab').click();
  await page.getByRole('button',{name:'このテストを使う',exact:true}).click();
  await page.locator('.performanceClassCard').click();
  await page.locator('.pairStudentSelect').nth(0).selectOption('1');
  await page.locator('.pairStudentSelect').nth(1).selectOption('2');
  assert.equal(await commonRow(0).locator('input').nth(1).isChecked(),true,'pupil A common score must survive reload');
  assert.equal(await commonRow(1).locator('input').nth(0).isChecked(),true,'pupil B common score must survive reload');
  assert.equal(await scoreRow(0,'必要な情報を伝える').locator('input').nth(2).isChecked(),true);
  assert.equal(await scoreRow(1,'相手の話に応じる').locator('input').nth(1).isChecked(),true);
  const positions=await page.evaluate(()=>{
    pairPanels.forEach(panel=>{const item=panel.result.items.find(item=>item.roleId===panel.role);panel.result.items=Array.from({length:40},(_,i)=>({...performanceClone(item),id:'long'+i}))});
    renderPairPerformance();
    const bodies=document.querySelectorAll('.pairPanelBody');bodies[0].scrollTop=250;bodies[1].scrollTop=200;
    const before=[bodies[0].scrollTop,bodies[1].scrollTop];
    setPairScore(0,'long1',pairPanels[0].result.items[1].levels[0].id);
    return {before,after:Array.from(document.querySelectorAll('.pairPanelBody'),node=>node.scrollTop)};
  });
  assert.ok(positions.before.every(position=>position>0),'both panels must actually be scrolled');
  assert.deepEqual(positions.after,positions.before,'scoring must preserve both pupils scroll positions');
  assert.deepEqual(errors,[]);console.log('PASS: editor, pair scores, shared common criteria, saved-result extension, pupil isolation, single-count totals and print rows, reload, legacy category, landscape layout, scroll preservation; no browser errors');
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
