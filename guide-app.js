(function(root,factory){
  const model=typeof module==='object'&&module.exports?require('./guide-model.js'):root.MitoriGuideModel;
  const api=factory(model);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MitoriGuideApp=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Model){
  function createGuideController({catalog,store,navigate,view}){
    const first=catalog[0];
    let state={screen:'none',guide:first,session:Model.createTodoSession(first,{}),introPage:0,
      visible:false,position:null,persistent:true,reviewCompleted:false};
    function paint(){
      state={...state,persistent:store.read(state.guide).persistent};
      view.patch({...state});
    }
    function saveUi(){store.saveUi({visible:state.visible,activeGuideId:state.guide.id,position:state.position});}
    function select(id){
      const guide=catalog.find(g=>g.id===id);
      if(!guide)return false;
      const saved=store.read(guide);
      state={...state,guide,session:Model.createTodoSession(guide,saved.checks),introPage:saved.introPage,
        position:saved.position,reviewCompleted:false};
      return true;
    }
    function restore(){
      const saved=store.read(first);
      if(select(saved.activeGuideId)){
        state={...state,visible:saved.visible,screen:saved.visible?'todo':'none'};
      }else state={...state,screen:'none',visible:false};
      paint();
    }
    async function dispatch(action){
      const guide=state.guide;
      try{
        switch(action.type){
          case 'menu':state={...state,screen:'menu'};break;
          case 'open':
            if(!select(action.guideId))return;
            if(store.read(state.guide).started||!state.guide.intro.length)state={...state,visible:true,screen:'todo'};
            else state={...state,screen:'intro'};
            saveUi();break;
          case 'intro':
            if(!select(action.guideId||guide.id))return;
            state={...state,screen:'intro'};break;
          case 'intro-page':
            state={...state,introPage:Math.max(0,Math.min(state.guide.intro.length-1,Number(action.page)||0))};
            store.saveIntro(guide.id,{started:store.read(guide).started,introPage:state.introPage});break;
          case 'start':
            store.saveIntro(guide.id,{started:true,introPage:state.introPage});
            state={...state,visible:true,screen:'todo'};saveUi();break;
          case 'check':
            state={...state,session:Model.setStepChecked(guide,state.session,action.stepId,action.checked),reviewCompleted:false};
            store.saveProgress(guide,state.session.checks);break;
          case 'expand':
            if(state.session.expandedIds.includes(action.stepId)===action.open)return;
            state={...state,session:Model.setStepExpanded(guide,state.session,action.stepId,action.open)};break;
          case 'close':
            if(action.surface==='overlay')state={...state,screen:state.visible?'todo':'none'};
            else state={...state,visible:false,screen:'none'};
            saveUi();break;
          case 'reset':
            if(await view.confirm('このTODOのチェックをすべて外します。登録したクラスや授業記録は変更されません。',{acceptLabel:'リセット',cancelLabel:'戻る'})){
              store.reset(guide);
              if(state.guide.id===guide.id)state={...state,session:Model.createTodoSession(guide,{}),reviewCompleted:false};
            }break;
          case 'jump':{
            const step=guide.steps.find(s=>s.id===action.stepId);
            if(step)await navigate(step.target);
            break;}
          case 'backup':await navigate({kind:'settings',pane:'backup'});break;
          case 'backup-later':state={...state,reviewCompleted:true};break;
          case 'review':state={...state,reviewCompleted:true};break;
          case 'position':state={...state,position:action.position};saveUi();break;
          default:return;
        }
      }catch{view.notify?.('操作を完了できませんでした。入力内容を確認して、もう一度お試しください。');}
      paint();
    }
    return {dispatch,restore};
  }
  return {createGuideController};
});
