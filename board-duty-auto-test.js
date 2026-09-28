(function(){
'use strict';
function init(){
  var prev=document.getElementById('dutyAutoPrevMonth');
  var next=document.getElementById('dutyAutoNextMonth');
  var label=document.getElementById('dutyAutoMonthLabel');
  var create=document.getElementById('dutyAutoTestCreate');
  var preview=document.getElementById('dutyAutoTestPreview');
  if(!prev||!next||!label||!create||!preview)return;
  if(create.dataset.dutyAutoBound==='1')return;create.dataset.dutyAutoBound='1';
  var now=new Date(), target=new Date(now.getFullYear(),now.getMonth()+1,1);
  function paint(){label.textContent=target.getFullYear()+'年 '+(target.getMonth()+1)+'月';}
  paint();
  prev.onclick=function(e){e.preventDefault();target=new Date(target.getFullYear(),target.getMonth()-1,1);paint();return false;};
  next.onclick=function(e){e.preventDefault();target=new Date(target.getFullYear(),target.getMonth()+1,1);paint();return false;};
  create.onclick=async function(e){
    e.preventDefault();create.disabled=true;preview.hidden=false;preview.textContent='保護者出欠から名簿を取得しています。';
    try{
      if(window.boardAccessReady)await window.boardAccessReady;
      var access=sessionStorage.getItem('yachiyoAttendancePass')||'';
      var headers={};
      if(access)headers['x-access-password']=access;
      var response=await fetch('/.netlify/functions/attendance-data',{cache:'no-store',credentials:'same-origin',headers:headers});
      if(!response.ok)throw new Error('保護者出欠の名簿を取得できませんでした。');
      var body=await response.json(), members=body&&body.data&&Array.isArray(body.data.members)?body.data.members:[], groups={'1':new Map(),'2':new Map(),'3':new Map()};
      members.forEach(function(mem){
        var grade=String(mem&&mem.grades&&mem.grades[0]||mem&&mem.grade||''); if(!groups[grade])return;
        var name=String(mem&&mem.name||'').replace(/[父母]$/,'').trim(), kana=String(mem&&mem.kana||'').replace(/[父母]$/,'').trim(); if(!name)return;
        var key=(kana||name).normalize('NFKC'); if(!groups[grade].has(key))groups[grade].set(key,{name:name,kana:kana||name});
      });
      var y=target.getFullYear(),m=target.getMonth()+1,active=m>=6?['2','1']:['3','2','1'];
      preview.innerHTML='';var h=document.createElement('b');h.textContent=y+'年'+m+'月 当番表（案）・試験';preview.appendChild(h);
      active.forEach(function(g){var vals=Array.from(groups[g].values()).sort(function(a,b){return a.kana.localeCompare(b.kana,'ja')});var d=document.createElement('div');d.style.marginTop='8px';var b=document.createElement('b');b.textContent=g+'年生 '+vals.length+'家庭';var n=document.createElement('div');n.textContent=vals.map(function(x){return x.name}).join('、');d.appendChild(b);d.appendChild(n);preview.appendChild(d);});
    }catch(err){preview.textContent='作成できませんでした：'+String(err&&err.message||err||'エラー');}
    finally{create.disabled=false;} return false;
  };
}
function boot(){init();setTimeout(init,250);setTimeout(init,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();