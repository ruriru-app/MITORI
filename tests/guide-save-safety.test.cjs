const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const extract=require('./helpers/extract-function.cjs');
function fixture(fail=true){
  const fields={sharedClassNameInput:{value:'1組'},sharedSchoolInput:{value:'学校'},sharedClassGradeInput:{value:'g'},
    sharedClassCountInput:{value:'2'},rosterText:{value:'1\t太郎\n2\t花子'},sharedClassModal:{style:{display:'flex'}},
    tileClassInput:{value:'c'},tileSubjectInput:{value:'s'},classTagSetInput:{value:''},tileShowSchoolInput:{checked:true},
    tileLessonListInput:{value:''},classLessonListInput:{value:''},classColorInput:{value:'grade3'},classModal:{style:{display:'flex'}}};
  const ctx={state:{sharedClasses:[{id:'c'}],sharedClassData:{c:{roster:{}}},classes:[],classData:{},classLayout:[],currentClass:null},
    editingSharedClassId:null,editingClassId:null,structuredClone,fields,alerts:[],rendered:0,
    $:id=>fields[id],alert:m=>ctx.alerts.push(m),grade:()=>({id:'g'}),normalizedSharedData:()=>({roster:{}}),
    tilesForSharedClass:()=>[],syncTileDerivedFields:c=>c.name='derived',subject:()=>({id:'s'}),lessonList:()=>null,
    sharedDataHasContent:()=>false,confirm:()=>true,
    render:()=>{ctx.rendered++;},save:()=>{if(fail)throw new Error('quota');ctx.persisted=JSON.stringify(ctx.state);},
  };
  vm.createContext(ctx);
  for(const name of ['sharedClass','cls','tileSharedClass','sharedClassForAny','sharedData','parseRosterPaste','tileData','runGuideSafeSave','saveSharedClassEdit','saveClassEdit'])vm.runInContext(extract(name),ctx);
  return ctx;
}
test('failed new-class save leaves no generated class or roster behind and keeps inputs',()=>{
  const ctx=fixture(),before=JSON.stringify(ctx.state);
  assert.equal(ctx.saveSharedClassEdit(false),false);
  assert.equal(JSON.stringify(ctx.state),before);
  assert.equal(ctx.editingSharedClassId,null);
  assert.equal(ctx.fields.rosterText.value,'1\t太郎\n2\t花子');
  assert.equal(ctx.fields.sharedClassModal.style.display,'flex');
  assert.equal(ctx.rendered,0);
});
test('failed tile save restores layout derived data and editing identity',()=>{
  const ctx=fixture(),before=JSON.stringify(ctx.state);
  assert.equal(ctx.saveClassEdit(),false);
  assert.equal(JSON.stringify(ctx.state),before);
  assert.equal(ctx.editingClassId,null);
  assert.equal(ctx.fields.classModal.style.display,'flex');
});
test('successful save closes only after persistence and render failure cannot undo it',()=>{
  const ctx=fixture(false);
  ctx.render=()=>{throw new Error('render');};
  assert.throws(()=>ctx.saveSharedClassEdit(false),/render/);
  assert.equal(ctx.state.sharedClasses.length,2);
  assert.equal(JSON.parse(ctx.persisted).sharedClasses.length,2);
});
test('invalid term dates leave saved and memory ranges intact',()=>{
  const ctx=fixture(false);
  ctx.state.termSettings={system:'trimester',trimester:[{id:'t',name:'1学期',start:'2026-04-01',end:'2026-07-20'}],breaks:[]};
  ctx.readDateRangeRows=id=>id==='termDateRows'?[{id:'t',name:'1学期',start:'2026-07-20',end:'2026-04-01'}]:[];
  vm.runInContext(extract('saveTermSettings'),ctx);
  const before=JSON.stringify(ctx.state);
  assert.equal(ctx.saveTermSettings(false),false);
  assert.equal(JSON.stringify(ctx.state),before);
  assert.equal(ctx.persisted,undefined);
});
test('missing class name and cancelled reference change do not alter data',()=>{
  const ctx=fixture(false);ctx.fields.sharedClassNameInput.value='';
  assert.equal(ctx.saveSharedClassEdit(false),false);
  assert.equal(ctx.persisted,undefined);
  ctx.state.classes=[{id:'tile',sharedClassId:'old'}];ctx.editingClassId='tile';
  ctx.sharedDataHasContent=()=>true;ctx.confirm=()=>false;
  const before=JSON.stringify(ctx.state);
  assert.equal(ctx.saveClassEdit(),false);
  assert.equal(JSON.stringify(ctx.state),before);
});
