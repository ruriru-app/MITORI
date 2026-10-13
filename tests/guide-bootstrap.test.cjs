const test=require('node:test'),assert=require('node:assert/strict'),App=require('../guide-app.js'),fs=require('node:fs'),path=require('node:path'),extract=require('./helpers/extract-function.cjs'),vm=require('node:vm');
test('a fresh browser shows an optional notice only once',()=>{
  const value={startupStatus:'fresh',checklistStartupStatus:'fresh',noticeShown:false};
  assert.equal(App.shouldShowInitialNotice(value),true);
  assert.equal(App.shouldShowInitialNotice({...value,noticeShown:true}),false);
  for(const kind of ['existing','unknown'])for(const key of ['startupStatus','checklistStartupStatus'])assert.equal(App.shouldShowInitialNotice({...value,[key]:kind}),false);
});
test('bootstrap menu and restoration do not navigate or rerender app',()=>{
  const calls=[],root={},ctx={document:{getElementById:id=>id==='mitoriGuideRoot'?root:{}},window:{},localStorage:{},
    MitoriGuideContent:{GUIDES:[]},MitoriGuideStorage:{createGuideStore:()=>({read:()=>({noticeShown:false}),markNoticeShown:()=>calls.push('seen')})},
    MitoriGuideView:{createGuideView:()=>({showNotice:()=>calls.push('notice')})},MitoriGuideNavigation:{createGuideNavigator:()=>({navigate:()=>calls.push('navigate')})},
    MitoriGuideApp:{...App,createGuideController:()=>({restore:()=>calls.push('restore'),dispatch:()=>calls.push('menu')})},
    createMitoriGuideHost:()=>({})};
  vm.createContext(ctx);vm.runInContext(extract('bootstrapMitoriGuide'),ctx);
  ctx.bootstrapMitoriGuide({startupStatus:'fresh',checklistStartupStatus:'existing'});assert.deepEqual(calls,['restore']);
});
test('guide root and header help stay outside all switched screens; provenance is read before app creation',()=>{
  const h=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(h,/<button[^>]+id="guideHelpBtn"[^>]+aria-label="使い方・初回設定"/);
  assert.match(h,/<div id="mitoriGuideRoot"><\/div>/);
  assert.ok(h.indexOf('guideStartupStatus')<h.indexOf('let state='));
  assert.doesNotMatch(extract('show'),/mitoriGuide/);
  assert.match(h,/onInitialStorageRead:/);
});
