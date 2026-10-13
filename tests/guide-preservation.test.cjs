const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Backup=require('../backup.js'),Content=require('../guide-content.js'),Storage=require('../guide-storage.js'),App=require('../guide-app.js'),memory=require('./helpers/guide-storage.cjs');
const extract=require('./helpers/extract-function.cjs');
test('configured timetable applies from its start without replacing existing boards or holidays',()=>{
  const ctx={state:{classes:[{id:'language'},{id:'math'}],timetable:{wed:{1:'language',2:'math'},thu:{1:'language'}},board:{'2026-10-21':{1:'math'}},timetableApplyStart:'2026-10-14',termSettings:{system:'trimester',trimester:[{start:'2026-01-01',end:'2026-12-31'}],breaks:[{start:'2026-10-15',end:'2026-10-15'}]}},JAPANESE_HOLIDAY_CACHE:new Map(),TIMETABLE_DAYS:[{key:'wed',day:3},{key:'thu',day:4}]};
  vm.createContext(ctx);
  for(const name of ['cls','dateAtNoon','dateKeyLocal','dateInsideRange','nthWeekdayOfMonth','japaneseHolidayMap','japaneseHolidayName','timetablePolicyCovers','isConfiguredInstructionDate','isAutomaticInstructionDate','timetableBoardForDate','applyTimetableBoardIfEmpty'])vm.runInContext(extract(name),ctx);
  assert.equal(ctx.applyTimetableBoardIfEmpty('2026-10-14'),true);
  assert.equal(JSON.stringify(ctx.state.board['2026-10-14']),'{"1":"language","2":"math"}');
  assert.equal(ctx.applyTimetableBoardIfEmpty('2026-10-21'),false);assert.equal(ctx.state.board['2026-10-21'][1],'math');
  assert.equal(ctx.applyTimetableBoardIfEmpty('2026-10-15'),false);
  assert.equal(ctx.applyTimetableBoardIfEmpty('2026-10-07'),false);
  ctx.state.timetableApplyStart='2026-01-01';assert.equal(ctx.applyTimetableBoardIfEmpty('2026-01-01'),false);
});
test('guide-only interactions leave primary and checklist stores byte-for-byte unchanged',async()=>{
  const storage=memory({'MITORI_PRIMARY':'{"roster":{"1":"架空の児童"}}'}),guide=Content.GUIDES[0],store=Storage.createGuideStore({storage}),before=storage.getItem('MITORI_PRIMARY');
  const checklist={values:{one:'○'}},snapshot=JSON.stringify(checklist);
  const c=App.createGuideController({catalog:Content.GUIDES,store,view:{patch:()=>{},confirm:async()=>true},navigate:async()=>{throw new Error('must not navigate');}});
  for(const action of [{type:'open',guideId:guide.id},{type:'intro-page',page:4},{type:'start'},{type:'check',stepId:'lesson_board',checked:true},{type:'check',stepId:'grade',checked:true},{type:'expand',stepId:'grade',open:true},{type:'position',position:{x:12,y:90}},{type:'close'},{type:'reset'}])await c.dispatch(action);
  assert.equal(storage.getItem('MITORI_PRIMARY'),before);assert.equal(JSON.stringify(checklist),snapshot);
  for(const key of Object.values(Storage.KEYS))assert.ok(!String(storage.getItem(key)).includes('架空の児童'));
});
test('full backup and restore keep guide progress outside both data stores',async()=>{
  const storage=memory(),guide=Content.GUIDES[0],store=Storage.createGuideStore({storage});store.saveProgress(guide,{grade:true});
  const main={classes:[],sharedClasses:[],records:[],grades:[],subjects:[],tagSets:[],lessonLists:[],archivedTiles:[],performanceTests:[],criteriaSets:[],classLayout:[],board:{},classData:{},sharedClassData:{},timetable:{},termSettings:{},weeklyPlan:{},performanceResults:{}};
  const checklist={appId:'MITORI_CHECKLIST',schemaVersion:3,sheetDefinitions:[]};
  const envelope=Backup.parseBackup(Backup.serializeBackup(Backup.createBackup(main,checklist,new Date(),'0.4.1')));
  assert.ok(!JSON.stringify(envelope).includes('MITORI_GUIDE'));
  let restoredMain,restoredChecklist;
  await Backup.commitRestore({previous:{mitoriState:main,checklistState:checklist},next:envelope,writeMitori:async data=>restoredMain=data,writeChecklist:async data=>restoredChecklist=data});
  assert.deepEqual(restoredMain,main);assert.deepEqual(restoredChecklist,checklist);assert.equal(store.read(guide).checks.grade,true);
});
test('offline navigation falls back to cached shell, and precache paths exist',async()=>{
  const handlers={},seen=[],response={marker:'cached-index'},ctx={self:{addEventListener:(type,handler)=>handlers[type]=handler,location:{origin:'http://localhost:55272'},clients:{claim:()=>{}}},
    fetch:async()=>{throw new Error('offline');},caches:{match:async request=>{seen.push(request);return response;}},URL};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8')+';this.shell=APP_SHELL;',ctx);
  let pending;handlers.fetch({request:{method:'GET',url:'http://localhost:55272/',mode:'navigate'},respondWith:value=>pending=value});
  assert.equal(await pending,response);assert.deepEqual(seen,['./index.html']);
  for(const request of ctx.shell)assert.ok(fs.existsSync(path.join(__dirname,'../',request.split('?')[0])),request+' missing');
});
