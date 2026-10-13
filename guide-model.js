(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MitoriGuideModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function createTodoSession(guide,checks={}){
    const safe=Object.fromEntries(guide.steps.map(step=>[step.id,checks?.[step.id]===true]));
    const first=guide.steps.find(step=>!safe[step.id]);
    return {checks:safe,expandedIds:first?[first.id]:[],lastCompletedId:null};
  }
  function setStepExpanded(guide,session,id,open){
    if(!guide.steps.some(step=>step.id===id))return session;
    const expandedIds=session.expandedIds.filter(value=>value!==id);
    if(open)expandedIds.push(id);
    return {...session,expandedIds};
  }
  function setStepChecked(guide,session,id,checked){
    const index=guide.steps.findIndex(step=>step.id===id);
    if(index<0)return session;
    const checks={...session.checks,[id]:checked===true};
    let expandedIds=session.expandedIds.filter(value=>value!==id);
    if(!checked)expandedIds.push(id);
    else{
      const next=guide.steps.slice(index+1).find(step=>!checks[step.id])||guide.steps.find(step=>!checks[step.id]);
      if(next&&!expandedIds.includes(next.id))expandedIds.push(next.id);
    }
    return {checks,expandedIds,lastCompletedId:checked?id:null};
  }
  function countCompleted(guide,checks){
    return guide.steps.filter(step=>checks?.[step.id]===true).length;
  }
  return {createTodoSession,setStepExpanded,setStepChecked,countCompleted};
});
