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
      var playerResponse=await fetch('/.netlify/functions/site-data?section=players',{cache:'no-store',credentials:'same-origin'});
      if(!playerResponse.ok)throw new Error('選手紹介の名簿を取得できませんでした。');
      var playerBody=await playerResponse.json(),players=Array.isArray(playerBody&&playerBody.data)?playerBody.data:[],playerCounts={'1':0,'2':0,'3':0},playerFamilies={'1':new Map(),'2':new Map(),'3':new Map()};
      function familyKey(value){return String(value||'').normalize('NFKC').trim().split(/[\s　（(]/)[0].replace(/[父母]$/,'');}
      players.forEach(function(p){var gm=String(p&&p.grade||'').match(/^([123])年/);if(!gm)return;var g=gm[1];playerCounts[g]++;var key=familyKey(p&&p.name);if(key){if(!playerFamilies[g].has(key))playerFamilies[g].set(key,[]);playerFamilies[g].get(key).push(String(p&&p.name||''));}});
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
        var b=document.createElement('b');var pc=playerCounts[g]||0,diff=vals.length-pc,matched=pc===vals.length;
        b.textContent=g+'年生　選手'+pc+'名 ／ 家庭候補'+vals.length+'家庭　'+(matched?'✓ 一致':'⚠ '+(diff>0?diff+'家庭多い':Math.abs(diff)+'家庭少ない'));b.className=matched?'duty-family-count-ok':'duty-family-count-warn';d.appendChild(b);
        if(!matched){
          var counts=new Map();vals.forEach(function(v){var k=familyKey(v.name);counts.set(k,(counts.get(k)||0)+1);});
          var suspects=vals.filter(function(v){var k=familyKey(v.name);return (counts.get(k)||0)>1;}).map(function(v){return v.name});
          if(suspects.length){var alert=document.createElement('div');alert.className='duty-family-suspects';alert.textContent='要確認：'+Array.from(new Set(suspects)).join('、');d.appendChild(alert);}
        }
        vals.forEach(function(x,index){
          var row=document.createElement('div');row.className='duty-family-row';
          var num=document.createElement('span');num.className='duty-family-no';num.textContent=String(index+1);
          var copy=document.createElement('span');copy.className='duty-family-copy';
          var name=document.createElement('strong');name.textContent=x.name;
          var kana=document.createElement('small');kana.textContent=x.kana;
          copy.appendChild(name);copy.appendChild(kana);
          var badge=document.createElement('span');badge.className='duty-family-badge is-ok';badge.textContent='✓';
          row.appendChild(num);row.appendChild(copy);row.appendChild(badge);d.appendChild(row);
        });
        preview.appendChild(d);
      });
      var actions=document.createElement('div');actions.className='duty-family-simple-actions';
      var allMatch=active.every(function(g){return (playerCounts[g]||0)===groups[g].size;});
      var proceed=document.createElement('button');proceed.type='button';proceed.textContent=allMatch?'人数一致・当番表案を見る':'人数不一致のため確認が必要';proceed.disabled=!allMatch;
      proceed.addEventListener('click',function(){
        var old=preview.querySelector('.duty-generated-plan');if(old)old.remove();
        var plan=document.createElement('section');plan.className='duty-generated-plan';
        var ph=document.createElement('b');ph.textContent=y+'年'+m+'月 当番表（案）';plan.appendChild(ph);
        var info=document.createElement('div');info.className='duty-generated-info';info.textContent='10月の続きから、各学年2家庭ずつ配置した試験案です。まだ公開・保存されません。';plan.appendChild(info);
        var lastTables=(window.DutyRosterData&&Array.isArray(window.DutyRosterData.INITIAL_TABLES))?window.DutyRosterData.INITIAL_TABLES:[];
        var starts={'2':'竹内','1':'川村'};
        var startAfter={'2':'筒井','1':'小池'};
        var gradeLists={};
        active.forEach(function(g){gradeLists[g]=Array.from(groups[g].values()).sort(function(a,b){return a.kana.localeCompare(b.kana,'ja')});});
        function key(v){return String(v||'').replace(/[（）()\s　]/g,'');}
        function startIndex(g){
          var list=gradeLists[g]||[], targetKey=key(startAfter[g]||'');
          var idx=list.findIndex(function(x){return key(x.name)===targetKey||key(x.name).startsWith(targetKey)||targetKey.startsWith(key(x.name));});
          return idx>=0?(idx+1)%list.length:0;
        }
        var pos={};active.forEach(function(g){pos[g]=startIndex(g);});
        var days=[];for(var d=1;d<=new Date(y,m,0).getDate();d++){var dt=new Date(y,m-1,d),wd=dt.getDay();if(wd===0||wd===6)days.push(d);}
        var table=document.createElement('table');table.className='duty-generated-table';
        var thead=document.createElement('thead'),trh=document.createElement('tr');['日付','曜日'].concat(active.flatMap(function(g){return[g+'年',g+'年'];})).forEach(function(t){var th=document.createElement('th');th.textContent=t;trh.appendChild(th);});thead.appendChild(trh);table.appendChild(thead);
        var tbody=document.createElement('tbody'),wdLabel=['日','月','火','水','木','金','土'];
        days.forEach(function(day){var tr=document.createElement('tr'),dt=new Date(y,m-1,day);var td=document.createElement('td');td.textContent=day;tr.appendChild(td);td=document.createElement('td');td.textContent=wdLabel[dt.getDay()];tr.appendChild(td);
          active.forEach(function(g){var list=gradeLists[g]||[];for(var k=0;k<2;k++){var cell=document.createElement('td');if(list.length){cell.textContent=list[pos[g]%list.length].name;pos[g]=(pos[g]+1)%list.length;}tr.appendChild(cell);}});
          tbody.appendChild(tr);
        });table.appendChild(tbody);plan.appendChild(table);
        var warn=document.createElement('div');warn.className='duty-generated-warning';warn.textContent='※現在は土日を対象日にした試験案です。次にサイトのスケジュールと連動して祝日・活動日・里山活動日を正確に反映します。';plan.appendChild(warn);
        preview.appendChild(plan);plan.scrollIntoView({behavior:'smooth',block:'start'});
      });
      actions.appendChild(proceed);preview.appendChild(actions);
    }catch(err){preview.style.display='block';preview.textContent='作成できませんでした：'+(err&&err.name==='AbortError'?'名簿取得がタイムアウトしました。':String(err&&err.message||err||'エラー'));}
    finally{create.disabled=false;} return false;
  };
}
function boot(){init();setTimeout(init,250);setTimeout(init,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();