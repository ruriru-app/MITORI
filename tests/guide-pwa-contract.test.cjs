const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
test('guide and checklist request versions match the installed PWA shell',()=>{
  const ctx={self:{addEventListener:()=>{}}};vm.createContext(ctx);vm.runInContext(sw+'; this.shell=APP_SHELL; this.cache=CACHE_NAME;',ctx);
  for(const file of ['guide-content.js','guide-model.js','guide-storage.js','guide-navigation.js','guide-app.js','guide-view.js','guide.css','checklist/app.js']){
    const request=file+'?v=0401';assert.ok(html.includes('"'+request+'"'),request+' not requested');assert.ok(ctx.shell.includes('./'+request),request+' not precached');
  }
  assert.equal(ctx.cache,'mitori-app-v14');assert.ok(!ctx.shell.some(file=>file.includes('tests/')));
});
test('all application JavaScript is syntactically valid before browser loading',()=>{
  const key=html.indexOf('const KEY='),start=html.lastIndexOf('<script>',key),end=html.lastIndexOf('</script>');
  assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
  for(const file of ['guide-content.js','guide-model.js','guide-storage.js','guide-navigation.js','guide-app.js','guide-view.js','checklist/app.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(__dirname,'../',file),'utf8')));
});
