const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../board-duty-auto-test.js'),'utf8');
class Element{
 constructor(){this.dataset={};this.children=[];this.style={setProperty(){}};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.nodes={};}
 set innerHTML(v){this.html=v;}get innerHTML(){return this.html||'';}
 querySelector(s){return this.nodes[s]??=new Element();}
 querySelectorAll(){return Object.values(this.nodes);}
 replaceChildren(...els){this.children=els;}append(...els){this.children.push(...els);}add(el){this.children.push(el);}setAttribute(){}insertBefore(el){this.children.push(el);}
 getContext(){return new Proxy({},{get:()=>()=>{}});}toDataURL(){return 'data:image/png;base64,YQ==';}
}
const members=[{id:'af',name:'山田父',kana:'やまだ父',grade:'2'},{id:'am',name:'山田母',kana:'やまだ母',grade:'2'},{id:'bf',name:'山田 太郎父',kana:'やまだ たろう父',grade:'2'},{id:'c',name:'佐藤母',kana:'さとう母',grade:'1'},{id:'d',name:'鈴木父',kana:'すずき父',grade:'1'}];
async function setup(excluded=[],fail=false){
 const ids={};['dutyAutoPrevMonth','dutyAutoNextMonth','dutyAutoMonthLabel','dutyAutoTestCreate','dutyAutoTestPreview','densukeAdminPanel'].forEach(id=>ids[id]=new Element());ids.densukeAdminPanel.dataset.adminPassword='test';ids.dutyAutoTestCreate.parentNode=new Element();
 let saved=null,confirmed=null;
 const context={document:{readyState:'complete',getElementById:id=>ids[id],createElement:()=>new Element()},Option:class extends Element{constructor(text,value){super();this.textContent=text;this.value=value;}},window:{boardAccessReady:Promise.resolve(),confirmGeneratedDutyRoster:async x=>{confirmed=x;return true;}},sessionStorage:{getItem:()=>''},setTimeout:()=>{},confirm:()=>true,alert:()=>{},console,fetch:async(url,opts)=>{
 if(opts?.method==='POST'){saved=JSON.parse(opts.body).data;return {ok:!fail,json:async()=>fail?{error:'保存失敗'}:{data:saved}};}
 return {ok:true,json:async()=>url.includes('duty-roster-settings')?{data:{excludedFamilies:excluded}}:url.includes('attendance-data')?{data:{members}}:url.includes('players')?{data:[{grade:'2年'},{grade:'2年'},{grade:'1年'},{grade:'1年'}]}:{data:[]}};
 }};
 vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));
 const fields=ids.dutyAutoTestCreate.parentNode.children[0];return {ids,fields,saved:()=>saved,confirmed:()=>confirmed,async generate(){await ids.dutyAutoTestCreate.onclick({preventDefault(){}});},async confirm(){const actions=ids.dutyAutoTestPreview.children[2];await actions.children[2].onclick();}};
}
const exclusion={grade:'2',name:'山田',kana:'やまだ',memberIds:['af','am']};
test('excludes both parents, preserves same-surname household and keeps draft confirmation',async()=>{
 const app=await setup([exclusion]);await app.generate();assert.equal(app.confirmed(),null);await app.confirm();const rows=app.confirmed().table.rows;assert.ok(rows.length);assert.ok(rows.every(r=>r[2]==='山田 太郎'&&r[3]==='山田 太郎'));assert.ok(rows.some(r=>r.includes('佐藤')));
});
test('removing exclusion restores family and persists empty selection',async()=>{
 const app=await setup([exclusion]);app.fields.querySelector('#dutyExclusionList').children[0].children[1].onclick();await app.generate();assert.deepEqual(app.saved().excludedFamilies,[]);await app.confirm();assert.ok(app.confirmed().table.rows.some(r=>r.includes('山田')));
});
test('adding one household captures both parent IDs, persists before draft, invalidates old draft',async()=>{
 const app=await setup();await app.generate();app.fields.querySelector('select').value='0';app.fields.querySelector('#dutyExclusionAdd').onclick();assert.equal(app.ids.dutyAutoTestPreview.hidden,true);await app.generate();assert.deepEqual(app.saved().excludedFamilies[0].memberIds,['af','am']);
});
test('save failure prevents draft and preserves unsaved exclusion',async()=>{
 const app=await setup([],true);app.fields.querySelector('select').value='0';app.fields.querySelector('#dutyExclusionAdd').onclick();await app.generate();assert.match(app.ids.dutyAutoTestPreview.innerHTML,/保存失敗/);assert.equal(app.confirmed(),null);assert.equal(app.fields.querySelector('#dutyExclusionSave').disabled,false);
});
test('all excluded families show an error instead of invalid assignments',async()=>{
 const app=await setup([exclusion,{grade:'2',name:'山田 太郎',kana:'やまだ たろう',memberIds:['bf']}]);await app.generate();assert.match(app.ids.dutyAutoTestPreview.innerHTML,/0家庭/);assert.equal(app.confirmed(),null);
});
test('stable parent IDs retain exclusion across grade changes',async()=>{
 const app=await setup([{...exclusion,grade:'1'}]);await app.generate();await app.confirm();assert.ok(app.confirmed().table.rows.every(r=>!r.includes('山田')));
});
test('confirmed draft uses numeric grade IDs required by roster API',async()=>{
 const app=await setup();await app.generate();await app.confirm();assert.deepEqual(Array.from(app.confirmed().table.grades),[2,1]);
});
const backend=fs.readFileSync(path.join(__dirname,'../netlify/functions/site-data.mjs'),'utf8');
const handler=backend.slice(backend.indexOf('    if (section === "duty-roster-settings") {'),backend.indexOf('    if (section === "seniorcup-registration") {'));
async function saveSettings(items){let saved=null;const f=new (Object.getPrototypeOf(async function(){}).constructor)('section','body','store','key','json',handler);const result=await f('duty-roster-settings',{data:{excludedFamilies:items}},{setJSON:async(k,v)=>saved=v},'settings',(body,status=200)=>({body,status}));return {result,saved};}
test('settings API validates and saves independently of published rosters',async()=>{
 let r=await saveSettings([exclusion]);assert.equal(r.result.status,200);assert.deepEqual(r.saved.excludedFamilies,[exclusion]);r=await saveSettings([]);assert.deepEqual(r.saved.excludedFamilies,[]);r=await saveSettings([{...exclusion,memberIds:'invalid'}]);assert.equal(r.result.status,400);assert.equal(r.saved,null);
 const start=backend.indexOf('    if (section === "duty-roster-settings") {');assert.ok(backend.lastIndexOf('if (!adminAuth.ok) return adminAuthError(json, adminAuth);',start)>backend.indexOf('const boardDirectSection'));
 assert.match(backend,/section === "duty-roster" \|\|\s*section === "duty-roster-settings" \|\|/);
});
