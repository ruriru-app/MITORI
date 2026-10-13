const test=require('node:test');
const assert=require('node:assert/strict');
const Content=require('../guide-content.js');
const Storage=require('../guide-storage.js');
const App=require('../guide-app.js');
const memory=require('./helpers/guide-storage.cjs');
const guide=Content.getGuide('initial-setup');
function setup(storage=memory(),confirm=true){
  const store=Storage.createGuideStore({storage});const states=[],calls=[];
  const view={patch:s=>states.push(structuredClone(s)),confirm:async()=>confirm,notify:()=>{}};
  const controller=App.createGuideController({catalog:Content.GUIDES,store,view,navigate:async t=>{calls.push(t);return true;}});
  return {store,controller,states,calls,storage};
}
test('intro starts optionally and checking never navigates',async()=>{
  const x=setup();
  await x.controller.dispatch({type:'open',guideId:guide.id});
  assert.equal(x.states.at(-1).screen,'intro');
  assert.equal(x.states.at(-1).visible,false);
  await x.controller.dispatch({type:'start'});
  await x.controller.dispatch({type:'check',stepId:'grade',checked:true});
  assert.equal(x.states.at(-1).session.checks.grade,true);
  assert.deepEqual(x.calls,[]);
  await x.controller.dispatch({type:'close'});
  assert.equal(x.store.read(guide).visible,false);
  assert.equal(x.store.read(guide).checks.grade,true);
  await x.controller.dispatch({type:'open',guideId:guide.id});
  assert.equal(x.states.at(-1).screen,'todo');
  assert.ok(x.states.at(-1).session.expandedIds.includes('subject'));
});
test('reload restores active panels but leaves closed panels closed',async()=>{
  const x=setup();await x.controller.dispatch({type:'open',guideId:guide.id});
  await x.controller.dispatch({type:'start'});
  const active=setup(x.storage);active.controller.restore();
  assert.equal(active.states.at(-1).visible,true);
  await x.controller.dispatch({type:'close'});
  const closed=setup(x.storage);closed.controller.restore();
  assert.equal(closed.states.at(-1).visible,false);
});
test('intro review preserves started status and checks',async()=>{
  const x=setup();await x.controller.dispatch({type:'open',guideId:guide.id});
  await x.controller.dispatch({type:'start'});
  await x.controller.dispatch({type:'check',stepId:'class',checked:true});
  await x.controller.dispatch({type:'intro',guideId:guide.id});
  await x.controller.dispatch({type:'intro-page',page:3});
  await x.controller.dispatch({type:'close',surface:'overlay'});
  assert.equal(x.store.read(guide).started,true);
  assert.equal(x.store.read(guide).checks.class,true);
  assert.equal(x.states.at(-1).visible,true);
  await x.controller.dispatch({type:'intro',guideId:guide.id});
  assert.equal(x.states.at(-1).introPage,0,'overview replay should start at the welcome page');
});
test('completion keeps panel open and backup is only navigation',async()=>{
  const x=setup();await x.controller.dispatch({type:'open',guideId:guide.id});
  await x.controller.dispatch({type:'start'});
  for(const s of guide.steps.slice().reverse())await x.controller.dispatch({type:'check',stepId:s.id,checked:true});
  assert.equal(x.states.at(-1).visible,true);
  assert.equal(x.states.at(-1).session.lastCompletedId,'grade');
  await x.controller.dispatch({type:'backup-later'});
  assert.deepEqual(x.calls,[]);
  await x.controller.dispatch({type:'backup'});
  assert.deepEqual(x.calls,[{kind:'settings',pane:'backup'}]);
});
test('cancel reset preserves checks and unknown restored guides stay hidden',async()=>{
  const x=setup(memory(),false);await x.controller.dispatch({type:'open',guideId:guide.id});
  await x.controller.dispatch({type:'start'});await x.controller.dispatch({type:'check',stepId:'grade',checked:true});
  await x.controller.dispatch({type:'reset'});
  assert.equal(x.store.read(guide).checks.grade,true);
  x.store.saveUi({visible:true,activeGuideId:'unknown',position:null});
  const y=setup(x.storage);y.controller.restore();
  assert.equal(y.states.at(-1).visible,false);
  assert.equal(y.store.read(guide).checks.grade,true);
});
test('switching guides keeps progress in the same view',async()=>{
  const store=Storage.createGuideStore({storage:memory()});
  const other={...guide,id:'other'};let state;
  const c=App.createGuideController({catalog:[guide,other],store,view:{patch:s=>state=s,confirm:async()=>true},navigate:async()=>true});
  await c.dispatch({type:'open',guideId:guide.id});await c.dispatch({type:'start'});
  await c.dispatch({type:'check',stepId:'grade',checked:true});
  await c.dispatch({type:'open',guideId:other.id});await c.dispatch({type:'start'});
  await c.dispatch({type:'check',stepId:'subject',checked:true});
  await c.dispatch({type:'open',guideId:guide.id});
  assert.equal(state.guide.id,guide.id);
  assert.equal(state.session.checks.grade,true);
  assert.equal(state.session.checks.subject,false);
  assert.equal(store.read(other).checks.subject,true);
});
