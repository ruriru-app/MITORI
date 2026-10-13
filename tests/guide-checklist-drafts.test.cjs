const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const extract=require('./helpers/extract-function.cjs');
const source=fs.readFileSync(path.join(__dirname,'../checklist/app.js'),'utf8');
function setup(){
  const nodes={},ctx={byId:id=>nodes[id],guideDraftBaselines:new Map(),paletteDraft:null};
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
