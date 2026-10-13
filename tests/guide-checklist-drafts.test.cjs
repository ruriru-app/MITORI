const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const extract=require('./helpers/extract-function.cjs');
const source=fs.readFileSync(path.join(__dirname,'../checklist/app.js'),'utf8');
function setup(){
  const nodes={},ctx={byId:id=>nodes[id],guideDraftBaselines:new Map(),paletteDraft:null,numberTarget:null,screen:'list',settingsSection:'palette',columnDraft:null,inputMethodColumnId:null,activeSheetId:'sheet',workspace:{classRecords:{}},recordKey:(column,student)=>column+'-'+student};
  vm.createContext(ctx);
  for(const name of ['checklistGuideSignature','captureChecklistGuideBaseline','getGuideNavigationState'])vm.runInContext(extract(name,source),ctx);
  function form(id){const input={id:'name',type:'text',value:'initial'},node={hidden:false,getClientRects:()=>[1],querySelectorAll:()=>[input]};nodes[id]=node;return {node,input};}
  return {ctx,nodes,form};
}
test('saved checklist form does not block; changed input does without saving it',()=>{
  const x=setup(),f=x.form('checklistEditorScreen');x.ctx.captureChecklistGuideBaseline('editor');
  assert.equal(x.ctx.getGuideNavigationState().kind,'safe');f.input.value='未保存';
  assert.equal(x.ctx.getGuideNavigationState().kind,'manual');assert.equal(f.input.value,'未保存');
  f.node.hidden=true;assert.equal(x.ctx.getGuideNavigationState().kind,'safe');
});
test('keypad input is manual until Enter commits the value and never mutates records',()=>{
  const x=setup();x.nodes.checklistNumberInput={value:'',hidden:false,getClientRects:()=>[1]};
  x.ctx.workspace.classRecords.c={sheet:{values:{}}};x.ctx.numberTarget={classId:'c',studentId:'p',columnId:'col'};
  assert.equal(x.ctx.getGuideNavigationState().kind,'safe');
  x.nodes.checklistNumberInput.value='7';assert.equal(x.ctx.getGuideNavigationState().kind,'manual');
  x.nodes.checklistNumberInput.getClientRects=()=>[];assert.equal(x.ctx.getGuideNavigationState().kind,'manual','main-mode switching must not hide the uncommitted input from inspection');
  assert.deepEqual(x.ctx.workspace.classRecords.c.sheet.values,{});
  x.ctx.workspace.classRecords.c.sheet.values['col-p']='7';assert.equal(x.ctx.getGuideNavigationState().kind,'safe');
});
test('outstanding checklist editor drafts are protected even behind another main mode',()=>{
  for(const [kind,id,screen,section] of [['editor','checklistEditorScreen','editor','palette'],['group','checklistGroupSettingsPane','settings','groups']]){
    const x=setup(),f=x.form(id);x.ctx.screen=screen;x.ctx.settingsSection=section;x.ctx.captureChecklistGuideBaseline(kind);
    f.input.value='draft';f.node.getClientRects=()=>[];
    assert.equal(x.ctx.getGuideNavigationState().kind,'manual');assert.equal(f.input.value,'draft');
  }
});
test('input method dialog changes block clean-dialog cleanup',()=>{
  const x=setup(),f=x.form('checklistInputMethodModal');x.ctx.captureChecklistGuideBaseline('method');f.input.value='cycle';
  assert.equal(x.ctx.getGuideNavigationState().kind,'manual');
});
test('cleanup closes clean dialogs but never commits a dirty draft',()=>{
  const x=setup(),column=x.form('checklistColumnModal'),method=x.form('checklistInputMethodModal');
  x.nodes.checklistExportModal={style:{display:'flex'}};const calls=[];
  x.ctx.closeColumnEditor=()=>{column.node.hidden=true;calls.push('column');};x.ctx.closeInputMethodDialog=()=>{method.node.hidden=true;calls.push('method');};x.ctx.closePalette=()=>calls.push('palette');
  vm.runInContext(extract('closeGuideNavigationDialogs',source),x.ctx);
  x.ctx.captureChecklistGuideBaseline('column');x.ctx.captureChecklistGuideBaseline('method');
  column.input.value='dirty';assert.equal(x.ctx.closeGuideNavigationDialogs(),false);assert.deepEqual(calls,[]);
  column.input.value='initial';assert.equal(x.ctx.closeGuideNavigationDialogs(),true);assert.deepEqual(calls,['column','method','palette']);
  assert.equal(x.nodes.checklistExportModal.style.display,'none');
});
test('palette structure changes are detected even if fields are unchanged',()=>{
  const x=setup();x.form('checklistPaletteSettingsPane');x.ctx.paletteDraft={entries:[{label:'○'}]};x.ctx.captureChecklistGuideBaseline('palette');
  x.ctx.paletteDraft.entries.push({label:'△'});assert.equal(x.ctx.getGuideNavigationState().kind,'manual');
  x.ctx.captureChecklistGuideBaseline('palette');assert.equal(x.ctx.getGuideNavigationState().kind,'safe');
});
test('column and group drafts use their entry baseline without auto committing',()=>{
  for(const [kind,id] of [['column','checklistColumnModal'],['group','checklistGroupSettingsPane']]){
    const x=setup(),f=x.form(id);x.ctx.captureChecklistGuideBaseline(kind);f.input.value='changed';
    assert.equal(x.ctx.getGuideNavigationState().kind,'manual');
    assert.equal(x.ctx.guideDraftBaselines.size,1);
  }
});
