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
    e.preventDefault();create.disabled=true;preview.hidden=false;preview.style.display='block';preview.style.minHeight='0';preview.textContent='保護者出欠から名簿を取得しています…';
    try{
      if(window.boardAccessReady)await window.boardAccessReady;
      var access=sessionStorage.getItem('yachiyoAttendancePass')||'';
      var headers={};
      if(access)headers['x-access-password']=access;
      var controller=new AbortController();var timer=setTimeout(function(){controller.abort();},8000);
      var response;
      try{response=await fetch('/.netlify/functions/attendance-data',{cache:'no-store',credentials:'same-origin',headers:headers,signal:controller.signal});}
      finally{clearTimeout(timer);}
      if(!response.ok)throw new Error('保護者出欠の名簿を取得できませんでした。');
      var body=await response.json(), members=body&&body.data&&Array.isArray(body.data.members)?body.data.members:[], groups={'1':new Map(),'2':new Map(),'3':new Map()};
      members.forEach(function(mem){
        var grade=String(mem&&mem.grades&&mem.grades[0]||mem&&mem.grade||''); if(!groups[grade])return;
        var rawName=String(mem&&mem.name||'').replace(/[父母]$/,'').trim(), kana=String(mem&&mem.kana||'').replace(/[父母]$/,'').trim(); if(!rawName)return;
        var name=rawName.replace(/^([^\s　（(]+)[\s　]+(.+)$/,function(_,family,given){return family+'（'+given.replace(/[（）()]/g,'')+'）';});
        var key=(kana||name).normalize('NFKC'); if(!groups[grade].has(key))groups[grade].set(key,{name:name,kana:kana||name});
      });
      var y=target.getFullYear(),m=target.getMonth()+1,active=m>=6?['2','1']:['3','2','1'];
      preview.innerHTML='';
      var h=document.createElement('b');h.textContent=y+'年'+m+'月 家庭名簿の確認（試験）';preview.appendChild(h);
      var note=document.createElement('div');note.className='duty-family-note';note.textContent='まだ当番表には配置しません。家庭単位の候補を確認してください。';preview.appendChild(note);
      active.forEach(function(g){
        var vals=Array.from(groups[g].values()).sort(function(a,b){return a.kana.localeCompare(b.kana,'ja')});
        var d=document.createElement('section');d.className='duty-family-grade';
        var b=document.createElement('b');b.textContent=g+'年生 '+vals.length+'候補';d.appendChild(b);
        vals.forEach(function(x,index){
          var row=document.createElement('div');row.className='duty-family-row';
          var num=document.createElement('span');num.className='duty-family-no';num.textContent=String(index+1);
          var copy=document.createElement('span');copy.className='duty-family-copy';
          var name=document.createElement('strong');name.textContent=x.name;
          var kana=document.createElement('small');kana.textContent=x.kana;
          copy.appendChild(name);copy.appendChild(kana);
          var badge=document.createElement('span');badge.className='duty-family-badge';badge.textContent='候補';
          row.appendChild(num);row.appendChild(copy);row.appendChild(badge);d.appendChild(row);
        });
        preview.appendChild(d);
      });
      var warn=document.createElement('div');warn.className='duty-family-warning';warn.textContent='同一家庭の父母が別候補になっている場合は、次の段階で家庭IDを指定して統合します。名字だけでは自動統合しません。';preview.appendChild(warn);
    }catch(err){preview.style.display='block';preview.textContent='作成できませんでした：'+(err&&err.name==='AbortError'?'名簿取得がタイムアウトしました。':String(err&&err.message||err||'エラー'));}
    finally{create.disabled=false;} return false;
  };
}
function boot(){init();setTimeout(init,250);setTimeout(init,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();