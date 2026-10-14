const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const extract=require('./helpers/extract-function.cjs');
function setup(){
  const calls=[],nodes={};const ctx={state:{sharedClasses:[],mode:'report'},
    guideEditorBaselines:new Map(),editingSharedClassId:null,editingClassId:null,selectedRecord:null,checklistApi:null,
    $:id=>nodes[id],document:{activeElement:null},MutationObserver:undefined,
    show:id=>calls.push(['show',id]),showSettingsPane:p=>calls.push(['pane',p]),setMode:m=>calls.push(['mode',m]),
    openSharedClassEdit:id=>calls.push(['class',id]),closeReportDetail:()=>{},calls,nodes};
  vm.createContext(ctx);
  for(const name of ['guideEditorRoots','isGuideElementVisible','guideFormSignature','captureGuideEditorBaseline','inspectGuideEditors','createMitoriGuideHost'])vm.runInContext(extract(name),ctx);
  const view={confirm:async()=>true,notify:()=>{},chooseClass:async()=>null};
  return {ctx,calls,nodes,view,host:ctx.createMitoriGuideHost(view)};
}
test('board route explicitly selects record mode even from report',async()=>{
  const x=setup();assert.equal(await x.host.openTarget({kind:'board'}),true);
  assert.deepEqual(x.calls,[['mode','record']]);
});
test('class choice cancel does not switch screen or select arbitrary class',async()=>{
  const x=setup();x.ctx.state.sharedClasses=[{id:'one',name:'1組',school:'A'},{id:'two',name:'1組',school:'B'}];
  assert.equal(await x.host.openTarget({kind:'roster'}),false);
  assert.deepEqual(x.calls,[]);
  x.view.chooseClass=async()=> 'two';
  assert.equal(await x.host.openTarget({kind:'roster'}),true);
  assert.deepEqual(x.calls,[['show','settingsView'],['pane','sharedClass'],['class','two']]);
});
test('roster in an open class keeps the input and does not reopen editor',async()=>{
  const x=setup();
  x.nodes.sharedClassModal={getClientRects:()=>[1]};
  x.nodes.rosterText={value:'未保存',scrollIntoView:()=>x.calls.push('scroll'),focus:()=>x.calls.push('focus')};
  assert.equal((await x.host.inspectEditors({kind:'roster'})).length,0);
  assert.equal(await x.host.openTarget({kind:'roster'}),true);
  assert.equal(x.nodes.rosterText.value,'未保存');
  assert.deepEqual(x.calls,['scroll','focus']);
});
test('checklist queued auto-save is flushed before navigation inspection',async()=>{
  const x=setup();let flushed=false;
  x.ctx.checklistApi={flush:async()=>flushed=true,getGuideNavigationState:()=>({kind:'safe'})};
  assert.equal((await x.host.inspectEditors({kind:'board'})).length,0);
  assert.equal(flushed,true);
  x.ctx.checklistApi.flush=async()=>{throw new Error('quota');};
  await assert.rejects(()=>x.host.inspectEditors({kind:'board'}),/quota/);
});
test('dirty forms are detected without persisting baseline data',async()=>{
  const x=setup(),input={id:'rosterText',value:'original',type:'textarea'};
  x.nodes.sharedClassModal={getClientRects:()=>[1],querySelectorAll:()=>[input]};
  x.ctx.captureGuideEditorBaseline('shared-class');
  input.value='changed';
  const edits=await x.host.inspectEditors({kind:'board'});
  assert.equal(edits.length,1);assert.equal(edits[0].kind,'saveable');
  assert.equal(edits[0].id,'shared-class');
  assert.equal(input.value,'changed');assert.deepEqual(x.calls,[]);
});
test('hidden term draft plus visible class draft blocks partial save and render',async()=>{
  const x=setup(),term={id:'termDate',type:'date',value:'2026-12-25'},name={id:'sharedClassNameInput',value:'1組'};
  x.nodes.termSettingsPane={getClientRects:()=>[],querySelectorAll:()=>[term]};
  x.nodes.sharedClassModal={style:{display:'flex'},getClientRects:()=>[1],querySelectorAll:()=>[name]};
  x.ctx.captureGuideEditorBaseline('term');x.ctx.captureGuideEditorBaseline('shared-class');
  term.value='2026-12-20';name.value='2組';
  x.ctx.saveSharedClassEdit=()=>{x.calls.push('save');term.value='2026-12-25';return true;};
  const nav=require('../guide-navigation.js').createGuideNavigator(x.host);
  assert.equal(await nav.navigate({kind:'board'}),false);
  assert.equal(term.value,'2026-12-20');assert.equal(name.value,'2組');assert.deepEqual(x.calls,[]);
  const pending=await x.host.inspectEditors({kind:'board'});assert.equal(pending.length,2);
});
test('checklist-owned clean dialog cleanup runs before opening destination',async()=>{
  const x=setup(),column={hidden:false},method={hidden:false};x.nodes.checklistColumnModal=column;
  x.ctx.checklistApi={closeGuideNavigationDialogs:()=>{column.hidden=true;method.hidden=true;x.calls.push('cleanup');return true;}};
  assert.equal(await x.host.openTarget({kind:'settings',pane:'grade'}),true);
  assert.equal(column.hidden,true);assert.equal(method.hidden,true);
  assert.deepEqual(x.calls,['cleanup',['show','settingsView'],['pane','grade']]);
});
test('returning to an unsaved initial-setup pane preserves its draft for manual save',()=>{
  const x=setup(),input={id:'date',value:'original'},pane={style:{display:'none'},getClientRects:()=>[],querySelectorAll:()=>[input]};
  x.nodes.termSettingsPane=pane;x.ctx.captureGuideEditorBaseline('term');input.value='draft';
  x.ctx.renderTermSettings=()=>input.value='original';
  vm.runInContext(extract('showSettingsPane'),x.ctx);x.ctx.showSettingsPane('term');
  assert.equal(input.value,'draft');assert.equal(pane.style.display,'block');
});

test('both school-specific grade add drafts block guide navigation without adding or clearing them',async()=>{
  const x=setup();
  x.nodes.newElementaryGradeNameInput={value:'小学校の未追加学年',getClientRects:()=>[1]};
  x.nodes.newJuniorGradeNameInput={value:'中学校の未追加学年',getClientRects:()=>[1]};
  const pending=await x.host.inspectEditors({kind:'board'});
  assert.deepEqual(Array.from(pending,item=>item.id),['newElementaryGradeNameInput','newJuniorGradeNameInput']);
  assert.ok(pending.every(item=>item.kind==='manual'));
  assert.equal(x.nodes.newElementaryGradeNameInput.value,'小学校の未追加学年');
  assert.equal(x.nodes.newJuniorGradeNameInput.value,'中学校の未追加学年');
  assert.deepEqual(x.calls,[]);
});
