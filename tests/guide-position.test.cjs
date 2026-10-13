const test=require('node:test'),assert=require('node:assert/strict'),Model=require('../guide-model.js');
test('previous completed row and next summary stay visible when they fit',()=>{
  assert.deepEqual(Model.resolveTodoScroll({scrollTop:0,viewportHeight:300,lastRow:{top:100,bottom:150},nextSummary:{top:170,bottom:210}}),{scrollTop:100,showRecent:false});
});
test('distant or wrapped next item shows the recent action above the list',()=>{
  assert.deepEqual(Model.resolveTodoScroll({scrollTop:900,viewportHeight:300,lastRow:{top:950,bottom:1000},nextSummary:{top:0,bottom:80}}),{scrollTop:0,showRecent:true});
  assert.deepEqual(Model.resolveTodoScroll({scrollTop:0,viewportHeight:50,lastRow:{top:0,bottom:100},nextSummary:{top:120,bottom:180}}),{scrollTop:120,showRecent:true});
});
test('positions are clamped with margin even in a small offset viewport',()=>{
  assert.deepEqual(Model.clampGuidePosition({x:9999,y:-10},{width:400,height:560},{left:0,top:0,width:1366,height:768}),{x:954,y:12});
  assert.deepEqual(Model.clampGuidePosition({x:900,y:900},{width:296,height:400},{left:50,top:100,width:320,height:424}),{x:62,y:112});
});
test('invalid or larger panel positions still give finite accessible top left',()=>{
  const pos=Model.clampGuidePosition({x:Infinity,y:NaN},{width:400,height:560},{left:0,top:80,width:300,height:200});
  assert.deepEqual(pos,{x:12,y:92});
});
