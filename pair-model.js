(function(root){
  'use strict';
  const roles=['role1','role2'];
  const common='common';
  function isPair(test){return test?.kind==='pair'}
  function roleName(test,role){
    if(role===common)return '共通';
    return String(test?.roleNames?.[role]||'').trim()||(role==='role2'?'役割２':'役割１');
  }
  function roleItems(result,role){return (result?.items||[]).filter(item=>item.roleId===role||item.roleId===common)}
  function addedCommonItems(test,saved){
    const savedIds=new Set((saved.items||[]).map(item=>item.id));
    return (test.items||[]).filter(item=>item.roleId===common&&!savedIds.has(item.id));
  }
  function progress(result,addedCount=0){
    if(!result)return '未評価';
    const items=result.items||[],done=items.filter(item=>(item.levels||[]).some(level=>level.id===item.selectedLevelId)).length;
    const total=items.length+addedCount;
    return (done===0?'未評価':done===total?'評価完了':'評価途中')+' '+done+'/'+total;
  }
  function itemLabel(result,item){return (isPair(result)?'【'+roleName(result,item.roleId)+'】':'')+(item.content||'評価内容未設定')}
  const api={roles,common,isPair,roleName,roleItems,addedCommonItems,progress,itemLabel};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MitoriPair=api;
})(typeof globalThis!=='undefined'?globalThis:this);
