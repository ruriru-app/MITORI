(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MitoriGuideNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function validTarget(target){
    if(target?.kind==='board'||target?.kind==='roster')return true;
    return target?.kind==='settings'&&['grade','subject','sharedClass','class','timetable','term','backup'].includes(target.pane);
  }
  function createGuideNavigator(host){
    let busy=false;
    async function navigate(target){
      if(busy||!validTarget(target))return false;
      busy=true;
      try{
        const pending=await host.inspectEditors(target);
        if(pending.length>1||pending.some(editor=>editor.kind!=='saveable')){
          const labels=[...new Set(pending.map(editor=>editor.label||'編集中の内容'))].join('、');
          await host.notify('入力中の内容があります（'+labels+'）。別の設定欄に残っている入力も確認し、保存・追加・実行などを済ませてから、もう一度移動ボタンを押してください。');
          return false;
        }
        if(pending.length){
          if(!await host.confirmSave(pending[0]))return false;
          if(!await host.saveEditor(pending[0]))return false;
        }
        return await host.openTarget(target)===true;
      }catch{
        await host.notify('移動を完了できませんでした。現在の画面の入力と保存状況を確認してください。');
        return false;
      }finally{busy=false;}
    }
    return {navigate};
  }
  return {createGuideNavigator,validTarget};
});
