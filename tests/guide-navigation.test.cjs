const test=require('node:test');
const assert=require('node:assert/strict');
const Navigation=require('../guide-navigation.js');
function fixture(editors=[],yes=true,saved=true){
  const calls=[];
  const host={inspectEditors:async()=>editors,confirmSave:async()=>{calls.push('confirm');return yes;},
    saveEditor:async()=>{calls.push('save');return saved;},openTarget:async target=>{calls.push(['open',target]);return true;},notify:()=>calls.push('notify')};
  return {calls,host,nav:Navigation.createGuideNavigator(host)};
}
test('saved selections navigate without confirmation',async()=>{
  const x=fixture();assert.equal(await x.nav.navigate({kind:'board'}),true);
  assert.deepEqual(x.calls,[['open',{kind:'board'}]]);
});
test('normal pending save is confirmed and committed before navigation',async()=>{
  const x=fixture([{id:'shared-class',kind:'saveable',label:'クラス'}]);
  assert.equal(await x.nav.navigate({kind:'board'}),true);
  assert.deepEqual(x.calls,['confirm','save',['open',{kind:'board'}]]);
});
test('cancelled or failed save never opens destination',async()=>{
  for(const [yes,saved,want] of [[false,true,['confirm']],[true,false,['confirm','save']]]){
    const x=fixture([{id:'tile',kind:'saveable'}],yes,saved);
    assert.equal(await x.nav.navigate({kind:'board'}),false);assert.deepEqual(x.calls,want);
  }
});
test('manual and multiple editors cannot be partially saved',async()=>{
  for(const editors of [[{kind:'manual',label:'記録'}],[{kind:'saveable'},{kind:'saveable'}]]){
    const x=fixture(editors);assert.equal(await x.nav.navigate({kind:'board'}),false);
    assert.deepEqual(x.calls,['notify']);
  }
});
test('concurrent requests perform only one save and release after completion',async()=>{
  const x=fixture([{kind:'saveable'}]);let finish;
  x.host.confirmSave=()=>new Promise(resolve=>finish=resolve);
  const first=x.nav.navigate({kind:'board'});await Promise.resolve();await Promise.resolve();
  assert.equal(await x.nav.navigate({kind:'board'}),false);
  finish(true);assert.equal(await first,true);
  assert.deepEqual(x.calls,['save',['open',{kind:'board'}]]);
});
test('inspection failure blocks navigation and illegal targets never reach host',async()=>{
  const x=fixture();x.host.inspectEditors=async()=>{throw new Error('checklist flush failed');};
  assert.equal(await x.nav.navigate({kind:'board'}),false);
  assert.deepEqual(x.calls,['notify']);
  const y=fixture();assert.equal(await y.nav.navigate({kind:'settings',pane:'delete'}),false);
  assert.deepEqual(y.calls,[]);
});
