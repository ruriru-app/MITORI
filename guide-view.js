(function(root,factory){
  const model=typeof module==='object'&&module.exports?require('./guide-model.js'):root.MitoriGuideModel;
  const api=factory(model);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MitoriGuideView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Model){
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=(items,tag='ul')=>items?.length?'<'+tag+'>'+items.map(t=>'<li>'+escape(t)+'</li>').join('')+'</'+tag+'>':'';
  function buildIntroMarkup(page){
    let html='<h2>'+escape(page.title)+'</h2>';
    html+=list(page.bullets);
    html+=(page.paragraphs||[]).map(p=>'<p>'+escape(p)+'</p>').join('');
    for(const section of page.sections||[])html+='<section><h3>'+escape(section.title)+'</h3>'+list(section.bullets)+(section.paragraphs||[]).map(p=>'<p>'+escape(p)+'</p>').join('')+'</section>';
    if(page.detailTitle)html+='<details><summary>'+escape(page.detailTitle)+'</summary>'+(page.detailParagraphs||[]).map(p=>'<p>'+escape(p)+'</p>').join('')+'</details>';
    return html;
  }
  function buildTodoMarkup(guide){
    return guide.steps.map(step=>{
      const id=escape(step.id);
      let example='';
      if(step.example)example='<table>'+step.example.map((row,i)=>'<tr>'+row.map(cell=>'<'+(i?'td':'th')+'>'+escape(cell)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>';
      return '<div class="guideRow" data-step-row="'+id+'"><div class="guideRowTop"><input class="guideCheck" id="guide-check-'+id+'" type="checkbox" data-step="'+id+'"><label for="guide-check-'+id+'">'+escape(step.title)+'</label><button type="button" data-action="jump" data-step="'+id+'">'+escape(step.jumpLabel)+'</button></div><details data-step="'+id+'"><summary>手順と説明</summary><div class="guideExplanation"><p>'+escape(step.description)+'</p>'+example+list(step.procedures,'ol')+(step.notes||[]).map(p=>'<p>'+escape(p)+'</p>').join('')+'</div></details></div>';
    }).join('');
  }
  function createGuideView({document,window,root,onAction}){
    const button=(text,action,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+text+'</button>';
    root.innerHTML='<div id="mitoriGuideMenu" class="guideOverlay" hidden><section class="guideDialog" role="dialog" aria-modal="true" aria-labelledby="guideMenuTitle"><header><h2 id="guideMenuTitle">使い方・初回設定</h2>'+button('×','close','data-surface="overlay" aria-label="案内を閉じる"')+'</header><div class="guideDialogBody"><p>必要なときに、手順を見ながら操作できます。</p>'+button('初回設定を進める','open','data-guide="initial-setup"')+' '+button('概要をもう一度見る','intro','data-guide="initial-setup"')+'</div></section></div>'+
      '<div id="mitoriGuideIntro" class="guideOverlay" hidden><section class="guideDialog" role="dialog" aria-modal="true" aria-label="MITORI初回案内"><header><strong>初回設定ガイド</strong><span id="guidePageCount"></span>'+button('×','close','data-surface="overlay" aria-label="案内を閉じる"')+'</header><div id="guideIntroBody" class="guideDialogBody"></div><footer>'+button('戻る','intro-prev')+button('次へ','intro-next')+'</footer></section></div>'+
      '<aside id="mitoriGuidePanel" class="guidePanel" aria-label="初回設定TODO" hidden><header><strong id="guidePanelTitle"></strong>'+button('×','close','aria-label="TODOを閉じる"')+'</header><p id="guideProgress" class="guideProgress" role="status"></p><progress id="guideProgressBar" max="9" value="0" aria-label="手動チェックの進捗"></progress><p id="guideInstructions">できた項目に、自分でチェックを入れてください。<br>途中で閉じても、続きから再開できます。</p><p id="guideSaveWarning" class="guideWarning" role="status" hidden>チェックの保存ができません。この画面を閉じると、今回の変更が残らない場合があります。</p><p id="guideRecent" role="status" hidden></p><div id="guideTodoScroll" class="guideTodoScroll"><div id="guideRows"></div><section id="guideCompletion" hidden><h3>初回設定、おつかれさまでした。</h3><p>作成したクラス・授業タイル・時間割を、バックアップしておきましょう。</p>'+button('今すぐバックアップ','backup')+' '+button('後で','backup-later')+'<p>バックアップは、必要なときに「各種設定」からも保存できます。</p>'+button('手順をもう一度確認する','review')+'</section>'+button('このTODOのチェックをリセット','reset','class="guideReset"')+'</div></aside>'+
      '<section id="mitoriGuideNotice" class="guideNotice" hidden><h3>はじめての方へ</h3><p>名簿の保存場所と、授業タイル・時間割の準備をご案内します。</p>'+button('初回案内を見る','notice-open')+' '+button('今はしない','notice-dismiss')+'</section>'+
      '<div id="mitoriGuideConfirm" class="guideOverlay guideConfirm" hidden></div><div id="mitoriGuideClassPicker" class="guideOverlay guideConfirm" hidden></div>';
    const byId=id=>root.querySelector('#'+id);
    let current=null,mounted='',opener=null,pending=null,drag=null;
    const panel=byId('mitoriGuidePanel'),handle=document.createElement('button');
    handle.type='button';handle.className='guideMoveHandle';handle.textContent='⠿ 移動';
    handle.setAttribute('aria-label','TODOを移動（ドラッグ、または矢印キー）');
    panel.querySelector('header').insertBefore(handle,panel.querySelector('header button'));
    function viewport(){const v=window.visualViewport;return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||window.innerWidth,height:v?.height||window.innerHeight};}
    function moveTo(position,persist=false){
      const v=viewport();
      panel.style.width=Math.max(0,Math.min(400,v.width-24))+'px';
      panel.style.maxHeight=Math.max(0,Math.min(560,v.height<320?v.height-24:v.height*.8))+'px';
      panel.classList.toggle('guideCompact',v.height<450);
      const size=panel.getBoundingClientRect();
      const corrected=Model.clampGuidePosition(position,{width:size.width,height:size.height},v);
      panel.style.left=corrected.x+'px';panel.style.top=corrected.y+'px';panel.style.right='auto';
      if(persist&&(current?.position?.x!==corrected.x||current?.position?.y!==corrected.y))onAction({type:'position',position:corrected});
      return corrected;
    }
    function resize(){if(current?.visible&&!drag){const v=viewport();moveTo(current.position||{x:v.left+v.width-412,y:v.top+90},true);}}
    function pointerDown(e){
      if(e.button!==0||drag)return;
      const rect=panel.getBoundingClientRect();drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:rect.left,y:rect.top,moved:false};
      handle.setPointerCapture(e.pointerId);
    }
    function pointerMove(e){
      if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
      if(!drag.moved&&Math.hypot(dx,dy)<5)return;
      drag.moved=true;moveTo({x:drag.x+dx,y:drag.y+dy});
    }
    function pointerEnd(e){
      if(!drag||drag.id!==e.pointerId)return;
      const moved=drag.moved;drag=null;
      if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
      if(moved){const rect=panel.getBoundingClientRect();moveTo({x:rect.left,y:rect.top},true);}
      else resize();
    }
    function handleKey(e){
      const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
      if(!delta)return;e.preventDefault();const rect=panel.getBoundingClientRect();moveTo({x:rect.left+delta[0],y:rect.top+delta[1]},true);
    }
    handle.addEventListener('pointerdown',pointerDown);handle.addEventListener('pointermove',pointerMove);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,pointerEnd);
    handle.addEventListener('keydown',handleKey);window.addEventListener('resize',resize);
    window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    function focusBack(){if(opener?.isConnected)opener.focus({preventScroll:true});}
    function dialog(element,title,body){
      element.innerHTML='<section class="guideDialog" role="dialog" aria-modal="true" aria-label="'+escape(title)+'"><header><h2>'+escape(title)+'</h2></header><div class="guideDialogBody">'+body+'</div></section>';
      element.hidden=false;
      window.requestAnimationFrame(()=>element.querySelector('button,select')?.focus());
    }
    async function confirm(message,{acceptLabel='確認',cancelLabel='戻る'}={}){
      if(pending)pending(false);
      const box=byId('mitoriGuideConfirm');
      const active=document.activeElement;
      dialog(box,'確認','<p>'+escape(message)+'</p><button type="button" data-result="yes">'+escape(acceptLabel)+'</button> <button type="button" data-result="no">'+escape(cancelLabel)+'</button>');
      return new Promise(resolve=>{
        const finish=result=>{box.hidden=true;box.onclick=null;pending=null;if(active?.isConnected)active.focus({preventScroll:true});resolve(result);};
        pending=finish;
        box.onclick=e=>{const b=e.target.closest('[data-result]');if(b)finish(b.dataset.result==='yes');};
      });
    }
    function chooseClass(classes){
      if(pending)pending(false);
      const box=byId('mitoriGuideClassPicker');const active=document.activeElement;
      dialog(box,'名簿を登録するクラスを選ぶ',classes.map(c=>'<button class="guideClassChoice" type="button" data-class-id="'+escape(c.id)+'">'+escape(c.label)+'</button>').join('')+'<button type="button" data-cancel>戻る</button>');
      return new Promise(resolve=>{
        const finish=value=>{box.hidden=true;box.onclick=null;pending=null;if(active?.isConnected)active.focus({preventScroll:true});resolve(value);};
        pending=()=>finish(null);
        box.onclick=e=>{const b=e.target.closest('button');if(b)finish(b.dataset.classId||null);};
      });
    }
    function patch(state){
      const previous=current;current=state;
      const overlay=state.screen==='menu'||state.screen==='intro';
      if(overlay&&!(previous?.screen==='menu'||previous?.screen==='intro'))opener=document.activeElement;
      byId('mitoriGuideMenu').hidden=state.screen!=='menu';
      byId('mitoriGuideIntro').hidden=state.screen!=='intro';
      byId('mitoriGuidePanel').hidden=!state.visible;
      if(previous&&(previous.screen==='menu'||previous.screen==='intro')&&!overlay)focusBack();
      if(previous?.visible&&!state.visible)document.getElementById('guideHelpBtn')?.focus({preventScroll:true});
      if(state.screen==='intro'){
        if(previous?.screen!=='intro'||previous.introPage!==state.introPage||previous.guide.id!==state.guide.id)byId('guideIntroBody').innerHTML=buildIntroMarkup(state.guide.intro[state.introPage]);
        byId('guidePageCount').textContent=(state.introPage+1)+' / '+state.guide.intro.length;
        byId('mitoriGuideIntro').querySelector('[data-action="intro-prev"]').disabled=state.introPage===0;
        byId('mitoriGuideIntro').querySelector('[data-action="intro-next"]').textContent=state.introPage===state.guide.intro.length-1?'設定を始める':'次へ';
      }
      if(mounted!==state.guide.id){
        byId('guideRows').innerHTML=buildTodoMarkup(state.guide);mounted=state.guide.id;
      }
      byId('guidePanelTitle').textContent=state.guide.title;
      const count=Model.countCompleted(state.guide,state.session.checks);
      byId('guideProgress').textContent=count+' / '+state.guide.steps.length+' 完了';
      byId('guideProgressBar').max=state.guide.steps.length;byId('guideProgressBar').value=count;
      byId('guideInstructions').hidden=!state.persistent;
      byId('guideSaveWarning').hidden=state.persistent;
      for(const step of state.guide.steps){
        const row=byId('guideRows').querySelector('[data-step-row="'+step.id+'"]');
        row.querySelector('input').checked=state.session.checks[step.id]===true;
        row.querySelector('details').open=state.session.expandedIds.includes(step.id);
        row.hidden=count===state.guide.steps.length&&!state.reviewCompleted&&step.id!==state.session.lastCompletedId;
      }
      byId('guideCompletion').hidden=count!==state.guide.steps.length;
      byId('guideRows').hidden=count===state.guide.steps.length&&!state.reviewCompleted&&!state.session.lastCompletedId;
      const last=state.guide.steps.find(s=>s.id===state.session.lastCompletedId);
      if(!last||previous?.session.lastCompletedId!==last.id||count===state.guide.steps.length)byId('guideRecent').hidden=!last||count!==state.guide.steps.length;
      byId('guideRecent').textContent=last?'✓ 直前に完了：'+last.title:'';
      if(state.visible)window.requestAnimationFrame(()=>{
        if(current.session!==state.session)return;
        resize();
        if(count===state.guide.steps.length){if(last&&previous?.session.lastCompletedId!==last.id)byId('guideTodoScroll').scrollTop=0;return;}
        if(!last||previous?.session.lastCompletedId===last.id)return;
        const index=state.guide.steps.findIndex(step=>step.id===last.id);
        const next=state.guide.steps.slice(index+1).find(step=>!state.session.checks[step.id])||state.guide.steps.find(step=>!state.session.checks[step.id]);
        if(!next)return;
        const scroll=byId('guideTodoScroll'),a=byId('guideRows').querySelector('[data-step-row="'+last.id+'"]'),b=byId('guideRows').querySelector('[data-step-row="'+next.id+'"] summary');
        const origin=scroll.getBoundingClientRect().top-scroll.scrollTop;
        const row=a.getBoundingClientRect(),summary=b.getBoundingClientRect();
        const result=Model.resolveTodoScroll({scrollTop:scroll.scrollTop,viewportHeight:scroll.clientHeight,lastRow:{top:row.top-origin,bottom:row.bottom-origin},nextSummary:{top:summary.top-origin,bottom:summary.bottom-origin}});
        byId('guideRecent').hidden=!result.showRecent;scroll.scrollTop=result.scrollTop;
      });
      if(overlay&&previous?.screen!==state.screen)window.requestAnimationFrame(()=>root.querySelector('.guideOverlay:not([hidden]) button')?.focus());
    }
    function click(e){
      const b=e.target.closest('[data-action]');if(!b||!root.contains(b))return;
      let type=b.dataset.action;
      if(type==='notice-dismiss'||type==='notice-open'){byId('mitoriGuideNotice').hidden=true;if(type==='notice-dismiss')return;type='open';}
      if(type==='intro-prev'||type==='intro-next'){
        if(type==='intro-next'&&current.introPage===current.guide.intro.length-1)onAction({type:'start'});
        else onAction({type:'intro-page',page:current.introPage+(type==='intro-next'?1:-1)});
        return;
      }
      onAction({type,guideId:b.dataset.guide||(type==='open'?'initial-setup':undefined),stepId:b.dataset.step,surface:b.dataset.surface});
    }
    function change(e){if(e.target.matches('input.guideCheck'))onAction({type:'check',stepId:e.target.dataset.step,checked:e.target.checked});}
    function toggle(e){if(e.target.matches('details[data-step]'))onAction({type:'expand',stepId:e.target.dataset.step,open:e.target.open});}
    function key(e){
      const overlay=root.querySelector('.guideConfirm:not([hidden])')||root.querySelector('.guideOverlay:not([hidden])');if(!overlay)return;
      if(e.key==='Escape'){
        e.preventDefault();e.stopImmediatePropagation();
        if(pending)pending(false);else onAction({type:'close',surface:'overlay'});
      }else if(e.key==='Tab'){
        const nodes=Array.from(overlay.querySelectorAll('button:not([disabled]),select,summary,input')).filter(n=>!n.closest('[hidden]'));
        const first=nodes[0],last=nodes.at(-1);
        if(!overlay.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first?.focus();}
        else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      }
    }
    root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('toggle',toggle,true);
    window.addEventListener('keydown',key,true);
    return {patch,confirm,chooseClass,notify:message=>confirm(message,{acceptLabel:'閉じる',cancelLabel:'戻る'}),
      showNotice:()=>{byId('mitoriGuideNotice').hidden=false;},
      destroy:()=>{if(pending)pending(false);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('toggle',toggle,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);root.replaceChildren();}};
  }
  return {buildIntroMarkup,buildTodoMarkup,createGuideView};
});
