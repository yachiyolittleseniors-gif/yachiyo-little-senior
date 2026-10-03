const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.SOURCE_DIR||path.join(__dirname,'..');
const GRANT='yachiyoAdminRevealUntil';
const ADMIN='yachiyoAdminSessionExpiresAt';
const END=1801000;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function storage(map=new Map()){
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function target(){
 const listeners=new Map(),classes=new Set(),styles=new Map(),attrs=new Map();
 return {
  classList:{add:(...vs)=>vs.forEach(v=>classes.add(v)),remove:(...vs)=>vs.forEach(v=>classes.delete(v)),contains:v=>classes.has(v)},
  style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''},
  setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
  addEventListener:(n,fn)=>{if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(fn);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;},
  emit(type,extra={}){const e={type,target:{closest:()=>true},preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...extra};this.dispatchEvent(e);return e;}
 };
}
function setup({pathname='/results',grant=0,desktop=false,cfg={pages:{},autoEnableOnLogin:true},adminResponse=null,boardReady=null}={}){
 let now=1000,nextTimer=0;
 const timers=new Map(),doc=target(),button=target(),footer=target();
 const local=storage(),session=storage();
 if(grant)local.setItem(GRANT,grant);
 button.style.setProperty('display','none');
 doc.documentElement=target();doc.body=target();doc.head={appendChild(){}};
 doc.hidden=false;doc.createElement=()=>({});
 doc.getElementById=id=>id==='densukeToggleBtn'?button:null;
 doc.querySelector=s=>s==='footer.footer'?footer:null;
 doc.querySelectorAll=s=>s==='.unified-admin-toggle'?[button]:[];
 const sandbox={...target(),document:doc,localStorage:local,sessionStorage:session,
  location:{pathname,href:'https://test.invalid'+pathname,origin:'https://test.invalid'},
  Date:{now:()=>now},URL,Event,Promise,console,
  setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
  matchMedia:()=>({matches:desktop,addEventListener(){}}),
  fetch:async url=>{
   if(String(url).includes('/admin-session'))return adminResponse?await adminResponse: new Response('{}',{status:401});
   if(String(url).includes('admin-visibility-settings'))return new Response(JSON.stringify({data:cfg}));
   return new Response(JSON.stringify({code:'ADMIN_SESSION_EXPIRED'}),{status:401});
  }
 };
 sandbox.window=sandbox;
 if(boardReady)sandbox.boardAccessReady=boardReady;
 const context=vm.createContext(sandbox);
 return{doc,button,footer,local,session,context,
  run(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});},
  visible(){return button.style.getPropertyValue('display')==='block'&&!doc.documentElement.classList.contains('admin-visibility-disabled');},
  async tick(time){now=time;for(let n=0;n<100;n++){const due=[...timers].find(([,t])=>t.at<=now);if(!due)return;timers.delete(due[0]);due[1].fn();await flush();}throw new Error('timer loop');}
 };
}
test('team-login grant survives an unauthenticated admin-session check on all public pages',async()=>{
 for(const pathname of ['/','/team','/schedule','/results','/players','/links','/seniorcup','/contact']){
  const a=setup({pathname,grant:END});a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();
  assert.equal(a.local.getItem(GRANT),String(END),pathname+' grant must survive');
  assert.equal(a.visible(),true,pathname+' button must show');
  assert.equal(a.context.YLSAdminSession.isActive(),false,'visibility must not grant edit privileges');
 }
});
test('a late admin 401 cannot erase a newly issued team-login grant',async()=>{
 const response=deferred(),a=setup({grant:END,adminResponse:response.promise});
 a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();assert.equal(a.visible(),true);
 response.resolve(new Response('{}',{status:401}));await flush();
 assert.equal(a.local.getItem(GRANT),String(END));assert.equal(a.visible(),true);
});
test('admin expiry clears edit credentials but preserves the independent reveal deadline',async()=>{
 const a=setup({grant:END});a.run('admin-session-client.js');await flush();
 a.context.YLSAdminSession.activate(2000);a.session.setItem('yachiyoAdminPassword','test-only');
 await a.tick(2000);
 assert.equal(a.context.YLSAdminSession.isActive(),false);assert.equal(a.session.getItem('yachiyoAdminPassword'),null);
 assert.equal(a.local.getItem(ADMIN),null);assert.equal(a.local.getItem(GRANT),String(END));
});
test('an ADMIN_SESSION_EXPIRED API response still expires editing without removing reveal',async()=>{
 const a=setup({grant:END});a.run('admin-session-client.js');await flush();a.context.YLSAdminSession.activate(5000);
 await a.context.fetch('/.netlify/functions/test-save');
 assert.equal(a.context.YLSAdminSession.isActive(),false);assert.equal(a.local.getItem(GRANT),String(END));
});
test('public reveal expires at 30 minutes without silently extending itself',async()=>{
 const a=setup({grant:END});a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();
 assert.equal(a.visible(),true);await a.tick(END);assert.equal(a.visible(),false);
 assert.equal(a.doc.emit('click').prevented,true);
});
test('no team login means no automatic visibility',async()=>{
 const a=setup();a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();assert.equal(a.visible(),false);
});
test('desktop OFF remains hidden; desktop ON accepts a team login without admin login',async()=>{
 for(const desktopEnabled of [false,true]){
  const a=setup({desktop:true,grant:END,cfg:{pages:{},autoEnableOnLogin:true,desktopEnabled}});
  a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();assert.equal(a.visible(),desktopEnabled);
 }
});
test('manual per-page visibility remains unchanged outside the login window',async()=>{
 for(const on of [false,true]){
  const a=setup({cfg:{pages:{'results.html':on},autoEnableOnLogin:false}});
  a.run('admin-session-client.js');a.run('admin-visibility.js');await flush();assert.equal(a.visible(),on);
 }
});
test('team page reveals immediately after async login without a focus/storage event',async()=>{
 const ready=deferred(),a=setup({pathname:'/board.html',boardReady:ready.promise});
 a.run('board-admin-reveal.js');assert.equal(a.visible(),false);
 a.local.setItem(GRANT,END);ready.resolve(true);await flush();assert.equal(a.visible(),true);
});
test('team page also handles login completed before reveal script initialization',async()=>{
 const a=setup({pathname:'/board.html',grant:END,boardReady:Promise.resolve(true)});
 a.run('board-admin-reveal.js');await flush();assert.equal(a.visible(),true);
});
test('failed or rejected board login cannot automatically reveal a stored grant',async()=>{
 for(const reject of [false,true]){
  const ready=deferred(),a=setup({pathname:'/board.html',grant:END,boardReady:ready.promise});
  a.run('board-admin-reveal.js');if(reject)ready.reject(new Error('test failure'));else ready.resolve(false);
  await flush();assert.equal(a.visible(),false);
 }
});
test('automatic team-page reveal ends at its deadline',async()=>{
 const a=setup({pathname:'/board.html',grant:END,boardReady:Promise.resolve(true)});
 a.run('board-admin-reveal.js');await flush();assert.equal(a.visible(),true);await a.tick(END);assert.equal(a.visible(),false);
});
test('independent five-tap team-page management entry is still available',async()=>{
 const a=setup({pathname:'/board.html',boardReady:Promise.resolve(true)});
 a.run('board-admin-reveal.js');await flush();assert.equal(a.visible(),false);
 for(let i=0;i<5;i++)a.footer.emit('touchend');assert.equal(a.visible(),true);
});
test('team page does not hide an active administrator during independent grant expiry',async()=>{
 const a=setup({pathname:'/board.html',grant:END,boardReady:Promise.resolve(true)});
 a.context.YLSAdminSession={isActive:()=>true};a.run('board-admin-reveal.js');await flush();await a.tick(END);assert.equal(a.visible(),true);
 a.context.YLSAdminSession={isActive:()=>false};a.doc.emit('yachiyo:admin-session-expired');assert.equal(a.visible(),false);
});
