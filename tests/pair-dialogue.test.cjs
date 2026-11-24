const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Pair=require('../pair-model.js');
const extract=require('./helpers/extract-function.cjs');
function element(){return {children:[],style:{},dataset:{},classList:{toggle(){}},append(...n){this.children.push(...n)},appendChild(n){this.children.push(n)},setAttribute(){},querySelectorAll(){return []},replaceChildren(...n){this.children=n},set innerHTML(v){this.children=[]},get innerHTML(){return ''}}}
function host(){
 const nodes={};const t={id:'t',kind:'pair',name:'対話',roleNames:{role1:'役割1',role2:'役割2'},items:[{id:'a',roleId:'role1',content:'項目A',levels:[{id:'x',score:1,criterion:'基準'}]},{id:'b',roleId:'role2',content:'項目B',levels:[{id:'y',score:2,criterion:'基準'}]}]};
 const c={id:'c',name:'5年1組'};
 const ctx={MitoriPair:Pair,document:{createElement:element},$:id=>nodes[id]??=(element()),state:{performanceResults:{}},activePerformanceTestId:'t',activePerformanceClassId:'c',performanceTest:()=>t,sharedClass:()=>c,sharedData:()=>({roster:{}}),studentName:(id,num)=>'児童'+num,getVisibleStudentCount:()=>3,performanceClone:v=>JSON.parse(JSON.stringify(v)),performanceResultKey:(t,c,n)=>t+'::'+c+'::'+Number(n),save(){},showPerformanceScreen(){},renderPerformanceClassGroups(){},perspectiveName:()=> '知識・技能',resultItemScore:item=>item.levels.find(l=>l.id===item.selectedLevelId)?.score||0,resultItemMax:item=>Math.max(...item.levels.map(l=>l.score)),alert(){},confirm:()=>true};
 ctx.performanceResult=(t,c,n)=>ctx.state.performanceResults[ctx.performanceResultKey(t,c,n)]||null;
 vm.createContext(ctx);
 vm.runInContext(['createPerformanceResultDraft','performanceCriteriaSignature','createPerformanceScoreMatrix','appendPerformanceScoreItems'].map(name=>extract(name)).join('\n'),ctx);
 const file=path.join(__dirname,'../pair-dialogue.js');
 if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 return {ctx,nodes,t};
}
test('pair session saves each pupil and both roles without duplicate pupils',()=>{
 const {ctx}=host();assert.equal(typeof ctx.openPairPerformance,'function');
 ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.selectPairStudent(1,'2');
 ctx.setPairScore(0,'a','x');ctx.setPairRole(0,'role2');ctx.setPairScore(0,'b','y');
 ctx.setPairScore(1,'b','y');ctx.selectPairStudent(0,'3');ctx.selectPairStudent(0,'1');
 assert.equal(ctx.state.performanceResults['t::c::1'].items[0].selectedLevelId,'x');
 assert.equal(ctx.state.performanceResults['t::c::1'].items[1].selectedLevelId,'y');
 assert.equal(ctx.state.performanceResults['t::c::2'].items[0].selectedLevelId,'');
 assert.equal(ctx.selectPairStudent(0,'2'),false);
 assert.equal(ctx.state.performanceResults['t::c::1'].kind,'pair');
 assert.equal(ctx.state.performanceResults['t::c::1'].roleNames.role2,'役割2');
});
test('storage failure retains pending input and prevents replacing the pupil',()=>{
 const {ctx,nodes}=host();assert.equal(typeof ctx.openPairPerformance,'function');
 ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.save=()=>{throw Error('full')};
 ctx.setPairScore(0,'a','x');
 assert.match(nodes.pairSaveStatus.textContent,/保存できません/);
 assert.equal(ctx.selectPairStudent(0,'3'),false);
 ctx.save=()=>{};assert.equal(ctx.savePairPerformance(),true);
 assert.equal(ctx.state.performanceResults['t::c::1'].items[0].selectedLevelId,'x');
});
test('blank pupil selection does not create an assessed result',()=>{
 const {ctx}=host();assert.equal(typeof ctx.openPairPerformance,'function');
 ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.selectPairStudent(0,'3');ctx.savePairPerformance();
 assert.deepEqual(Object.keys(ctx.state.performanceResults),[]);
});
test('adding a common item to an existing test preserves earlier scores and records the common mark once',()=>{
 const {ctx,nodes,t}=host();ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.setPairScore(0,'a','x');
 t.items.push({id:'common-item',roleId:'common',content:'相手に伝わる声で話す',levels:[{id:'yes',score:3},{id:'no',score:0}]});
 ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.selectPairStudent(1,'2');
 const lookup=(node,text)=>node.textContent===text||node.children.some(child=>lookup(child,text));
 assert.ok(lookup(nodes.pairPanels,'評価途中 1/3'));
 ctx.setPairScore(0,'common-item','yes');ctx.setPairRole(0,'role2');
 ctx.setPairScore(0,'b','y');ctx.setPairScore(1,'common-item','no');
 const first=ctx.state.performanceResults['t::c::1'],second=ctx.state.performanceResults['t::c::2'];
 assert.deepEqual(Array.from(first.items,item=>item.selectedLevelId),['x','y','yes']);
 assert.deepEqual(Array.from(second.items,item=>item.selectedLevelId),['','','no']);
 ctx.setPairScore(0,'common-item','');
 assert.equal(ctx.state.performanceResults['t::c::1'].items[2].selectedLevelId,'');
 assert.equal(t.items[2].selectedLevelId,undefined);
});
test('export does not borrow a deleted or reassigned pair item score by position',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(extract('performanceResultItemFor'),ctx);
 const saved=[{id:'old',roleId:'role1',selectedLevelId:'high'}];
 assert.equal(ctx.performanceResultItemFor({id:'new',roleId:'role2'},0,saved),null);
 assert.equal(ctx.performanceResultItemFor({id:'old',roleId:'role2'},0,saved),null);
 assert.equal(ctx.performanceResultItemFor({id:'old',roleId:'role1'},0,saved),saved[0]);
});
test('full backup round trip preserves role names and both individual results',()=>{
 const {ctx}=host();ctx.openPairPerformance();ctx.selectPairStudent(0,'1');ctx.selectPairStudent(1,'2');
 ctx.setPairScore(0,'a','x');ctx.setPairScore(1,'b','y');
 const Backup=require('../backup.js');
 for(const key of ['classes','sharedClasses','records','grades','subjects','tagSets','lessonLists','archivedTiles','performanceTests','criteriaSets','classLayout'])ctx.state[key]=[];
 for(const key of ['board','classData','sharedClassData','timetable','termSettings','weeklyPlan'])ctx.state[key]={};
 const restored=Backup.parseBackup(JSON.stringify(Backup.createBackup(ctx.state,{appId:'MITORI_CHECKLIST',schemaVersion:1,sheetDefinitions:[]},'2026-11-21T00:00:00Z','0.4.1')));
 assert.equal(restored.mitoriState.performanceResults['t::c::1'].roleNames.role1,'役割1');
 assert.equal(restored.mitoriState.performanceResults['t::c::2'].items[1].selectedLevelId,'y');
});
