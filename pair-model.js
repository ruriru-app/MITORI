(function(root){
  'use strict';
  const roles=['role1','role2'];
  function isPair(test){return test?.kind==='pair'}
  function roleName(test,role){return String(test?.roleNames?.[role]||'').trim()||(role==='role2'?'役割２':'役割１')}
  function roleItems(result,role){return (result?.items||[]).filter(item=>item.roleId===role)}
  function progress(result){
    if(!result)return '未評価';
    const items=result.items||[],done=items.filter(item=>(item.levels||[]).some(level=>level.id===item.selectedLevelId)).length;
    return (done===0?'未評価':done===items.length?'評価完了':'評価途中')+' '+done+'/'+items.length;
  }
  function itemLabel(result,item){return (isPair(result)?'【'+roleName(result,item.roleId)+'】':'')+(item.content||'評価内容未設定')}
  const api={roles,isPair,roleName,roleItems,progress,itemLabel};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MitoriPair=api;
})(typeof globalThis!=='undefined'?globalThis:this);
