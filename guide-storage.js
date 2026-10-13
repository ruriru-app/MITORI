(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MitoriGuideStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KEYS={progress:'MITORI_GUIDE_PROGRESS_V1',ui:'MITORI_GUIDE_UI_V1',notice:'MITORI_GUIDE_NOTICE_V1'};
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const position=value=>object(value)&&Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:null;
  const page=value=>Number.isInteger(value)?Math.max(0,Math.min(4,value)):0;
  function inspectStartupData(storage){
    try{
      if(!storage||!Number.isInteger(storage.length))return 'unknown';
      for(let i=0;i<storage.length;i++){
        const key=storage.key(i);
        if(typeof key==='string'&&key.startsWith('MITORI_')&&!key.startsWith('MITORI_GUIDE_'))return 'existing';
      }
      return 'fresh';
    }catch{return 'unknown';}
  }
  function createGuideStore({storage,onError=()=>{}}={}){
    let persistent=true;
    function fail(error){persistent=false;try{onError(error);}catch{}}
    function load(key){
      try{
        const text=storage?.getItem(key);
        if(!storage){fail(new Error('保存先を読み込めません'));return {};}
        if(text===null||text===undefined)return {};
        const value=JSON.parse(text);
        if(!object(value)||value.schemaVersion!==1)throw new Error('ガイド保存情報を読み込めません');
        return value;
      }catch(error){fail(error);return {};}
    }
    const loaded=load(KEYS.progress);
    const guides=object(loaded.guides)?{...loaded.guides}:{};
    const rawUi=load(KEYS.ui);
    let ui={visible:rawUi.visible===true,activeGuideId:typeof rawUi.activeGuideId==='string'?rawUi.activeGuideId:'initial-setup',position:position(rawUi.position)};
    let noticeShown=load(KEYS.notice).noticeShown===true;
    function write(key,value){
      try{
        if(!storage)throw new Error('保存先を利用できません');
        storage.setItem(key,JSON.stringify({schemaVersion:1,...value}));
        return true;
      }catch(error){fail(error);return false;}
    }
    function entry(id){
      if(!/^[a-z][a-z0-9-]{0,63}$/.test(id))throw new Error('不正なガイド識別子です');
      if(!object(guides[id]))guides[id]={};
      return guides[id];
    }
    function checksFor(guide,checks){
      return Object.fromEntries(guide.steps.map(step=>[step.id,checks?.[step.id]===true]));
    }
    function read(guide){
      const value=entry(guide.id);
      return {checks:checksFor(guide,value.checks),started:value.started===true,introPage:Math.min(page(value.introPage),Math.max(0,(guide.intro?.length||1)-1)),
        ...ui,position:position(ui.position),noticeShown,persistent};
    }
    function saveProgress(guide,checks){
      const value=entry(guide.id);
      guides[guide.id]={checks:checksFor(guide,checks),started:value.started===true,introPage:page(value.introPage)};
      return write(KEYS.progress,{guides});
    }
    function saveIntro(id,value){
      const current=entry(id);
      guides[id]={checks:object(current.checks)?current.checks:{},started:value.started===true,introPage:page(value.introPage)};
      return write(KEYS.progress,{guides});
    }
    function saveUi(value){
      ui={visible:value.visible===true,activeGuideId:typeof value.activeGuideId==='string'?value.activeGuideId:ui.activeGuideId,position:position(value.position)};
      return write(KEYS.ui,ui);
    }
    function markNoticeShown(){noticeShown=true;return write(KEYS.notice,{noticeShown});}
    return {read,saveProgress,saveIntro,saveUi,markNoticeShown,reset:guide=>saveProgress(guide,{})};
  }
  return {KEYS,createGuideStore,inspectStartupData};
});
