const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const root=process.env.SOURCE_DIR||path.join(__dirname,'..');
const configSource=fs.readFileSync(path.join(root,'admin-button-config.js'),'utf8');
const controllerSource=fs.readFileSync(path.join(root,'admin-button-controller.js'),'utf8');

const flush=()=>new Promise(resolve=>setImmediate(resolve));

function classList(){
  const set=new Set();
  return {add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>on?set.add(x):set.delete(x)};
}
function target(){
  const listeners=new Map(),styles=new Map(),attrs=new Map();
  return {
    textContent:'管理',classList:classList(),dataset:{},
    style:{setProperty:(k,v)=>styles.set(k,String(v)),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''},
    setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)||null,
    addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},
    emit(name,extra={}){const e={type:name,target:this,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};for(const fn of listeners.get(name)||[])fn(e);return e},
    closest(sel){return sel.includes('button')?this:null}
  };
}
function storage(map=new Map()){return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}}

async function setup({pathname='/results',grant=0,desktop=false,pageEnabled=true}={}){
  let now=1000,timerId=0;
  const timers=new Map(),button=target(),trigger=target(),body=target(),html=target(),local=storage();
  trigger.closest=()=>null;
  if(grant)local.setItem('yachiyoAdminRevealUntil',String(grant));
  const doc={
    body,documentElement:html,hidden:false,
    getElementById:id=>id==='yls-admin-button-css'?null:null,
    createElement:()=>({}),
    querySelector(sel){
      if(sel==='#adminModeToggle'||sel==='#densukeToggleBtn')return button;
      if(sel==='.restored-footer-copy'||sel==='footer.footer')return trigger;
      if(sel==='#densukeAdminPanel.show,#cupAdminArea.show,#contactAdminPanel.show,#adminModal.show')return null;
      return null;
    },
    addEventListener(){},
  };
  body.appendChild=()=>{};
  html.appendChild=()=>{};
  const sandbox={
    window:null,document:doc,location:{pathname},localStorage:local,sessionStorage:storage(),
    Date:{now:()=>now},console,Promise,URL,
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:now+(Number(ms)||0)});return id},
    clearTimeout:id=>timers.delete(id),
    fetch:async()=>({ok:true,json:async()=>({data:{pages:{'results.html':pageEnabled},desktopEnabled:desktop}})}),
    matchMedia:()=>({matches:desktop,addEventListener(){}})
  };
  sandbox.window=sandbox;
  sandbox.window.matchMedia=sandbox.matchMedia;
  vm.runInNewContext(configSource,sandbox,{filename:'admin-button-config.js'});
  vm.runInNewContext(controllerSource,sandbox,{filename:'admin-button-controller.js'});
  await flush();

  async function tick(to=now){
    now=to;
    for(let i=0;i<100;i++){
      const due=[...timers].find(([,v])=>v.at<=now);
      if(!due)break;
      timers.delete(due[0]);due[1].fn();await flush();
    }
  }
  return {
    sandbox,button,trigger,body,local,tick,
    visible:()=>button.style.getPropertyValue('display')==='block',
    tap(){trigger.emit('pointerup',{target:trigger})},
    focus(){sandbox.YLSAdminButtonController.sync()}
  };
}

test('login grant alone never shows the management button',async()=>{
  const a=await setup({grant:1801000});
  assert.equal(a.visible(),false);
});

test('five taps reveal only while the 30-minute login grant is active',async()=>{
  const a=await setup({grant:1801000});
  for(let i=0;i<4;i++)a.tap();
  assert.equal(a.visible(),false);
  a.tap();
  assert.equal(a.visible(),true);
});

test('without team-page login, five taps do nothing',async()=>{
  const a=await setup({grant:0});
  for(let i=0;i<5;i++)a.tap();
  assert.equal(a.visible(),false);
});

test('grant expiry hides a revealed button',async()=>{
  const a=await setup({grant:2000});
  for(let i=0;i<5;i++)a.tap();
  assert.equal(a.visible(),true);
  await a.tick(2000);
  assert.equal(a.visible(),false);
});

test('management exit resets reveal and requires five taps again',async()=>{
  const a=await setup({grant:1801000});
  for(let i=0;i<5;i++)a.tap();
  assert.equal(a.visible(),true);
  a.body.classList.add('admin-mode');
  a.button.textContent='管理終了';
  a.button.emit('click',{target:a.button});
  a.body.classList.remove('admin-mode');
  a.button.textContent='管理';
  await a.tick();
  assert.equal(a.visible(),false);
  a.focus();
  assert.equal(a.visible(),false);
});

test('page-level OFF prevents reveal',async()=>{
  const a=await setup({grant:1801000,pageEnabled:false});
  for(let i=0;i<5;i++)a.tap();
  assert.equal(a.visible(),false);
});

test('team page also requires login grant plus five taps',async()=>{
  const a=await setup({pathname:'/board.html',grant:1801000});
  for(let i=0;i<4;i++)a.tap();
  assert.equal(a.visible(),false);
  a.tap();
  assert.equal(a.visible(),true);
});

test('all managed pages load exactly one shared config and controller and no legacy reveal logic',()=>{
  const pages=['index.html','team.html','schedule.html','results.html','players.html','links.html','seniorcup.html','contact.html','board.html'];
  for(const page of pages){
    const source=fs.readFileSync(path.join(root,page),'utf8');
    assert.equal((source.match(/admin-button-config\.js/g)||[]).length,1,page+' config');
    assert.equal((source.match(/admin-button-controller\.js/g)||[]).length,1,page+' controller');
    assert.equal((source.match(/unified-admin-reveal-script/g)||[]).length,0,page+' old inline reveal');
    assert.equal((source.match(/board-admin-reveal\.js/g)||[]).length,0,page+' old board reveal');
    assert.equal((source.match(/src="\.\/admin-visibility\.js/g)||[]).length,0,page+' old visibility runtime');
  }
});
