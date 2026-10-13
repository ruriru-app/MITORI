const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
module.exports=function extract(name,source=html){
  const html=source;
  const start=html.search(new RegExp('function\\s+'+name+'\\s*\\('));
  if(start<0)throw new Error('Missing function '+name);
  let depth=0;
  for(let i=html.indexOf('{',start);i<html.length;i++){
    if(html[i]==='{')depth++;
    if(html[i]==='}'&&--depth===0)return html.slice(html.slice(start-6,start)==='async '?start-6:start,i+1);
  }
  throw new Error('Unclosed function '+name);
};
