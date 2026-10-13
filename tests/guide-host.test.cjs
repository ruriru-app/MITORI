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
