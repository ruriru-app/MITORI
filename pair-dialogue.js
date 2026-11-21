// Dedicated pair UI; test definitions and individual result storage belong to the host.
let pairPanels=[];
function pairElement(tag,className='',text=''){
  const node=document.createElement(tag);node.className=className;node.textContent=text;return node;
}
function setPairSaveStatus(message,failed=false){
  $('pairSaveStatus').textContent=message;
  $('pairSaveStatus').classList.toggle('error',failed);
  $('pairRetrySaveBtn').hidden=!failed;
}
function openPairPerformance(){
  pairPanels=[{num:'',role:'role1',result:null,dirty:false},{num:'',role:'role2',result:null,dirty:false}];
  const test=performanceTest(activePerformanceTestId),c=sharedClass(activePerformanceClassId);
  $('pairTitle').textContent=c.name+'／'+test.name;
  setPairSaveStatus('自動保存');
  showPerformanceScreen('performancePairScreen');renderPairPerformance();
}
function savePairPerformance(){
  const pending=pairPanels.filter(panel=>panel.dirty&&panel.result);
  if(!pending.length)return true;
  const previous=[];
  for(const panel of pending){
    const result=performanceClone(panel.result);
    result.savedAt=new Date().toISOString();
    const key=performanceResultKey(result.testId,result.classId,result.studentNo);
    previous.push([key,state.performanceResults[key]]);
    state.performanceResults[key]=result;
  }
  try{save()}
  catch(error){
    previous.forEach(([key,result])=>{if(result)state.performanceResults[key]=result;else delete state.performanceResults[key]});
    setPairSaveStatus('保存できません。入力は画面に残っています。「再保存」を押してください。',true);
    return false;
  }
  pending.forEach(panel=>panel.dirty=false);
  setPairSaveStatus('保存済み');return true;
}
function selectPairStudent(side,num){
  const panel=pairPanels[side],other=pairPanels[1-side];
  if(!panel)return false;
  num=num?String(Number(num)):'';
  if((num&&other.num===num)||!savePairPerformance()){renderPairPerformance();return false}
  if(num&&(!Number.isInteger(Number(num))||Number(num)<1||Number(num)>getVisibleStudentCount(activePerformanceClassId)))return false;
  panel.num=num;panel.dirty=false;
  const test=performanceTest(activePerformanceTestId),c=sharedClass(activePerformanceClassId);
  const saved=num?performanceResult(test.id,c.id,num):null;
  panel.result=num?(saved?performanceClone(saved):createPerformanceResultDraft(test,c,num)):null;
  renderPairPerformance(side);return true;
}
function setPairRole(side,role){
  if(!MitoriPair.roles.includes(role)||pairPanels[side].role===role)return;
  pairPanels[side].role=role;renderPairPerformance(side);
}
function setPairScore(side,itemId,levelId){
  const panel=pairPanels[side],item=panel?.result?.items.find(item=>item.id===itemId&&item.roleId===panel.role);
  if(!item||!(levelId===''||item.levels.some(level=>level.id===levelId)))return;
  item.selectedLevelId=levelId;panel.dirty=true;savePairPerformance();renderPairPerformance();
}
function clearPairResult(side){
  const panel=pairPanels[side];if(!panel?.result)return;
  if(!confirm(panel.num+'番の両方の役割の評価とメモを消しますか？'))return;
  if(!savePairPerformance())return;
  const key=performanceResultKey(panel.result.testId,panel.result.classId,panel.num),previous=state.performanceResults[key];
  delete state.performanceResults[key];
  try{save()}catch(error){if(previous)state.performanceResults[key]=previous;$('pairSaveStatus').textContent='保存できません。評価は消去されていません。';return}
  panel.result=createPerformanceResultDraft(performanceTest(activePerformanceTestId),sharedClass(activePerformanceClassId),panel.num);
  panel.dirty=false;setPairSaveStatus('未評価に戻しました');renderPairPerformance();
}
function renderPairPerformance(resetSide=-1){
  const root=$('pairPanels');
  const positions=Array.from(root.querySelectorAll('.pairPanelBody'),node=>({
    top:node.scrollTop,
    matrices:Array.from(node.querySelectorAll('.scoreMatrixWrap'),matrix=>matrix.scrollLeft)
  }));
  const focusId=document.activeElement?.id;
  root.innerHTML='';
  const test=performanceTest(activePerformanceTestId),c=sharedClass(activePerformanceClassId);
  pairPanels.forEach((panel,side)=>{
    const section=pairElement('section','pairPanel'),top=pairElement('div','pairPanelTop');
    const select=pairElement('select','pairStudentSelect');
    select.id='pairStudent_'+side;
    select.setAttribute('aria-label',side===0?'左の児童・生徒':'右の児童・生徒');
    const empty=pairElement('option','','児童・生徒を選択');empty.value='';select.appendChild(empty);
    for(let num=1;num<=getVisibleStudentCount(c.id);num++){
      const saved=performanceResult(test.id,c.id,num);
      const option=pairElement('option','',num+'番　'+(studentName(c.id,num)||'名前未登録')+'　'+MitoriPair.progress(saved));
      option.value=String(num);option.disabled=String(num)===pairPanels[1-side].num;select.appendChild(option);
    }
    select.value=panel.num;
    select.title=panel.num?panel.num+'番　'+(studentName(c.id,panel.num)||'名前未登録'):'';
    select.onchange=()=>selectPairStudent(side,select.value);top.appendChild(select);
    const roles=pairElement('div','pairRoleSwitch');roles.setAttribute('aria-label','評価する役割');
    MitoriPair.roles.forEach(role=>{
      const button=pairElement('button','btn'+(panel.role===role?' primary':''),MitoriPair.roleName(panel.result||test,role));
      button.id='pairRole_'+side+'_'+role;
      button.title=button.textContent;
      button.setAttribute('aria-pressed',String(panel.role===role));button.onclick=()=>setPairRole(side,role);roles.appendChild(button);
    });
    top.appendChild(roles);section.appendChild(top);
    const body=pairElement('div','pairPanelBody');
    if(!panel.result){body.appendChild(pairElement('p','performanceEmpty','上の欄から児童・生徒を選択してください。'))}
    else{
      body.appendChild(pairElement('div','pairProgress',MitoriPair.progress(panel.result)));
      const items=MitoriPair.roleItems(panel.result,panel.role);
      if(!items.length)body.appendChild(pairElement('p','performanceEmpty','この役割の評価項目はありません。'));
      const changeScore=(item,levelId)=>setPairScore(side,item.id,levelId);
      appendPerformanceScoreItems(body,items,{
        compact:true,radioPrefix:'pairScore_'+side+'_',onSelect:changeScore,onClear:changeScore
      });
      const total=panel.result.items.reduce((sum,item)=>sum+resultItemScore(item),0),max=panel.result.items.reduce((sum,item)=>sum+resultItemMax(item),0);
      body.appendChild(pairElement('div','pairTotal','両役割合計　'+total+' / '+max+'点'));
      const memoLabel=pairElement('label','pairMemo','個人メモ（両役割共通）'),memo=pairElement('textarea');memo.value=panel.result.memo||'';memo.setAttribute('aria-label',panel.num+'番の個人メモ');
      memo.oninput=()=>{panel.result.memo=memo.value;panel.dirty=true;savePairPerformance()};memoLabel.appendChild(memo);body.appendChild(memoLabel);
      const actions=pairElement('div','performanceActions');
      const print=pairElement('button','btn','個票PDF');print.onclick=()=>{if(savePairPerformance())openPerformancePrintPreview([{test,c,num:panel.num,result:performanceClone(panel.result)}],c.name+' '+panel.num+'番／個票',test.name+'_'+panel.num+'番')};
      const clear=pairElement('button','btn','両役割を未評価に戻す');clear.onclick=()=>clearPairResult(side);actions.append(print,clear);body.appendChild(actions);
    }
    section.appendChild(body);root.appendChild(section);
    if(side!==resetSide&&positions[side]){
      body.scrollTop=positions[side].top;
      body.querySelectorAll('.scoreMatrixWrap').forEach((matrix,index)=>{
        matrix.scrollLeft=positions[side].matrices[index]||0;
      });
    }
  });
  if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
}
function renderPairEditor(){
  const box=$('pairRoleEditor');box.innerHTML='';box.hidden=!MitoriPair.isPair(performanceDraft);
  if(box.hidden)return;
  performanceDraft.roleNames=performanceDraft.roleNames||{};
  MitoriPair.roles.forEach(role=>{
    const label=pairElement('label','',role==='role1'?'役割1の名前':'役割2の名前'),input=pairElement('input');
    input.value=performanceDraft.roleNames[role]||'';input.placeholder=role==='role1'?'役割1':'役割2';input.maxLength=40;
    input.oninput=()=>{performanceDraft.roleNames[role]=input.value;renderPerformanceItems()};label.appendChild(input);box.appendChild(label);
  });
}
function appendPairItemRole(card,item){
  if(!MitoriPair.isPair(performanceDraft))return;
  item.roleId=MitoriPair.roles.includes(item.roleId)?item.roleId:'role1';
  const label=pairElement('label','pairItemRole','評価する役割'),select=pairElement('select');
  MitoriPair.roles.forEach(role=>{const option=pairElement('option','',MitoriPair.roleName(performanceDraft,role));option.value=role;select.appendChild(option)});
  select.value=item.roleId;select.onchange=()=>item.roleId=select.value;label.appendChild(select);card.appendChild(label);
}
function initPairPerformance(){
  $('performanceIndividualTab').onclick=()=>{performanceKindFilter='individual';renderPerformanceTestList()};
  $('performancePairTab').onclick=()=>{performanceKindFilter='pair';renderPerformanceTestList()};
  $('pairRetrySaveBtn').onclick=savePairPerformance;
  $('pairBackBtn').onclick=()=>{if(savePairPerformance()){showPerformanceScreen('performanceClassScreen');renderPerformanceClassGroups()}};
  $('pairClassPrintBtn').onclick=()=>{if(savePairPerformance())openPerformanceClassPrint()};
  $('pairClassSummaryBtn').onclick=()=>{if(savePairPerformance())showPerformanceSummaryChoice()};
  window.addEventListener('beforeunload',event=>{if(pairPanels.some(panel=>panel.dirty)){event.preventDefault();event.returnValue=''}});
  document.addEventListener('click',event=>{
    if(pairPanels.some(panel=>panel.dirty)&&!$('performancePairScreen').contains(event.target)&&!savePairPerformance()){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
}
