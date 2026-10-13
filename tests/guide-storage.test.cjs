const test=require('node:test');
const assert=require('node:assert/strict');
const Content=require('../guide-content.js');
const Storage=require('../guide-storage.js');
const memory=require('./helpers/guide-storage.cjs');
const guide=Content.getGuide('initial-setup');
const other={...guide,id:'other-guide'};
test('close reopen and switching guide keep their own checks',()=>{
  const storage=memory();let store=Storage.createGuideStore({storage});
  store.saveProgress(guide,{grade:true});
  store.saveProgress(other,{subject:true});
  store.saveIntro(guide.id,{started:true,introPage:3});
  store.saveUi({visible:false,activeGuideId:guide.id,position:{x:12,y:80}});
  store=Storage.createGuideStore({storage});
  assert.equal(store.read(guide).checks.grade,true);
  assert.equal(store.read(guide).visible,false);
  assert.equal(store.read(guide).started,true);
  assert.equal(store.read(guide).introPage,3);
  assert.deepEqual(store.read(guide).position,{x:12,y:80});
  assert.equal(store.read(other).checks.subject,true);
  assert.equal(store.read(other).checks.grade,false);
});
test('reset touches only current guide, not application or backup keys',()=>{
  const storage=memory({MITORI_V033_SETTINGS_LAYOUT_SYNC:'original',MITORI_BACKUP_META_V1:'backup'});
  const store=Storage.createGuideStore({storage});
  store.saveProgress(guide,{grade:true});store.saveProgress(other,{subject:true});
  store.saveIntro(guide.id,{started:true,introPage:4});store.markNoticeShown();
  store.reset(guide);
  assert.equal(store.read(guide).checks.grade,false);
  assert.equal(store.read(other).checks.subject,true);
  assert.equal(store.read(guide).started,true);
  assert.equal(store.read(guide).noticeShown,true);
  assert.equal(storage.getItem('MITORI_V033_SETTINGS_LAYOUT_SYNC'),'original');
  assert.equal(storage.getItem('MITORI_BACKUP_META_V1'),'backup');
  assert.deepEqual(Array.from(storage.values.keys()).filter(x=>x.startsWith('MITORI_GUIDE_')).sort(),
    ['MITORI_GUIDE_NOTICE_V1','MITORI_GUIDE_PROGRESS_V1']);
});
test('new step ids start unchecked without losing saved ids',()=>{
  const store=Storage.createGuideStore({storage:memory()});
  store.saveProgress(guide,{grade:true});
  const changed={...guide,steps:[...guide.steps,{id:'new-step'}]};
  assert.equal(store.read(changed).checks.grade,true);
  assert.equal(store.read(changed).checks['new-step'],false);
});
test('quota and access failures preserve memory progress and warn',()=>{
  let errors=0;
  const storage=memory();storage.setItem=()=>{throw new Error('quota');};
  const store=Storage.createGuideStore({storage,onError:()=>errors++});
  assert.equal(store.saveProgress(guide,{grade:true}),false);
  assert.equal(store.read(guide).checks.grade,true);
  assert.equal(store.read(guide).persistent,false);
  assert.ok(errors>0);
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.doesNotThrow(()=>Storage.createGuideStore({storage:denied}).read(guide));
  assert.equal(Storage.inspectStartupData(denied),'unknown');
});
test('corrupt guide entry does not erase a valid other guide',()=>{
  const storage=memory({MITORI_GUIDE_PROGRESS_V1:JSON.stringify({schemaVersion:1,guides:{
    'initial-setup':'broken','other-guide':{checks:{subject:true}}
  }}),MITORI_GUIDE_UI_V1:'broken-json',MITORI_V033_SETTINGS_LAYOUT_SYNC:'safe'});
  const store=Storage.createGuideStore({storage});
  assert.equal(store.read(guide).checks.grade,false);
  assert.equal(store.read(other).checks.subject,true);
  store.reset(guide);
  assert.equal(storage.getItem('MITORI_V033_SETTINGS_LAYOUT_SYNC'),'safe');
  assert.equal(store.read(other).checks.subject,true);
});
test('non-finite position and out-of-range intro index normalize safely',()=>{
  const store=Storage.createGuideStore({storage:memory()});
  store.saveUi({visible:true,activeGuideId:guide.id,position:{x:NaN,y:Infinity}});
  store.saveIntro(guide.id,{started:false,introPage:999});
  assert.equal(store.read(guide).position,null);
  assert.equal(store.read(guide).introPage,4);
});
test('startup ignores guide keys but recognizes app and backup keys',()=>{
  assert.equal(Storage.inspectStartupData(memory()),'fresh');
  assert.equal(Storage.inspectStartupData(memory({MITORI_GUIDE_UI_V1:'{}'})),'fresh');
  assert.equal(Storage.inspectStartupData(memory({MITORI_V033_SETTINGS_LAYOUT_SYNC:'{}'})),'existing');
  assert.equal(Storage.inspectStartupData(memory({MITORI_BACKUP_META_V1:'{}'})),'existing');
});
