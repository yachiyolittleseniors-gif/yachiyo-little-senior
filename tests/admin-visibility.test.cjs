const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../admin-visibility.js','utf8');
async function setup(cfg,{active=false,desktop=false,grant=0,path='/index.html'}={}){
 let now=1000,until=active?1801000:0;const classes=new Set(),events={},timers=new Map(),local=new Map([['yachiyoAdminRevealUntil',String(grant)]]);let id=0;
 const doc={head:{appendChild(){}},createElement:()=>({}),querySelectorAll:()=>[],body:{classList:{remove(){}}},documentElement:{classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}},addEventListener:(name,cb)=>{(events[name]??=[]).push(cb)}};
 const sandbox={document:doc,location:{pathname:path},Date:{now:()=>now},localStorage:{getItem:k=>local.get(k),removeItem:k=>local.delete(k)},sessionStorage:{removeItem(){}},window:{matchMedia:()=>({matches:desktop,addEventListener(){}}),addEventListener(){},YLSAdminSession:{isActive:()=>until>now,expiresAt:()=>until}},setTimeout:(fn,ms)=>{timers.set(++id,{fn,time:now+ms});return id;},clearTimeout:i=>timers.delete(i),fetch:async()=>({ok:true,json:async()=>({data:cfg})})};
 vm.runInNewContext(source,sandbox);await new Promise(r=>setImmediate(r));
 return {visible:()=>!classes.has('admin-visibility-disabled'),setTime:t=>now=t,emit:name=>(events[name]||[]).forEach(cb=>cb({target:{closest:()=>true},preventDefault(){},stopImmediatePropagation(){}})),login(){until=1801000;this.emit('yachiyo:admin-session-active');},expire(){now=1801000;this.emit('yachiyo:admin-session-expired');},tick(t){now=t;for(const [k,v] of [...timers])if(v.time<=t){timers.delete(k);v.fn();}}};
}
test('OFF: manual ON button is available before authentication and unchanged on login or expiry',async()=>{
 const app=await setup({pages:{'index.html':true},autoEnableOnLogin:false,autoOffEnabled:false});assert.equal(app.visible(),true);app.login();assert.equal(app.visible(),true);app.expire();assert.equal(app.visible(),true);app.emit('pointerup');assert.equal(app.visible(),true);
});
test('OFF: manual OFF stays hidden after authentication, ignoring old automatic grants',async()=>{
 const app=await setup({pages:{'index.html':false},autoEnableOnLogin:false,autoOffEnabled:false},{grant:1801000});assert.equal(app.visible(),false);app.login();assert.equal(app.visible(),false);
});
test('OFF: removed manual timer no longer hides manually enabled pages',async()=>{
 const app=await setup({pages:{'index.html':true},autoEnableOnLogin:false,autoOffEnabled:true,expiresAt:{'index.html':2000}});assert.equal(app.visible(),true);app.login();app.tick(2000);assert.equal(app.visible(),true);app.expire();assert.equal(app.visible(),true);
});
test('ON: only authenticated device with automatic grant reveals buttons for 30 minutes',async()=>{
 const cfg={pages:{'index.html':false},autoEnableOnLogin:true};const app=await setup(cfg,{grant:1801000});assert.equal(app.visible(),false);app.login();assert.equal(app.visible(),true);app.expire();assert.equal(app.visible(),false);
 assert.equal((await setup(cfg,{active:true})).visible(),false);
});
test('desktop setting still applies to manual and automatic modes',async()=>{
 for(const auto of [false,true]){const cfg={pages:{'index.html':true},autoEnableOnLogin:auto,autoOffEnabled:false};assert.equal((await setup(cfg,{desktop:true,active:true,grant:1801000})).visible(),false);assert.equal((await setup({...cfg,desktopEnabled:true},{desktop:true,active:true,grant:1801000})).visible(),true);}
});
test('pretty URL and team management entry remain supported',async()=>{
 assert.equal((await setup({pages:{'team.html':false}},{path:'/team',active:true})).visible(),false);assert.equal((await setup({pages:{'board.html':false}},{path:'/board.html'})).visible(),true);
});
