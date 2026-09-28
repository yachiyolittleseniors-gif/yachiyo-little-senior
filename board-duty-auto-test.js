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
      var scheduleResponse=await fetch('/.netlify/functions/site-data?section=schedule',{cache:'no-store',credentials:'same-origin'});
      if(!scheduleResponse.ok)throw new Error('スケジュールを取得できませんでした。');
      var scheduleBody=await scheduleResponse.json(),scheduleEvents=Array.isArray(scheduleBody&&scheduleBody.data)?scheduleBody.data:[];
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
      if(allMatch){Array.from(preview.querySelectorAll('.duty-family-grade,.duty-family-note')).forEach(function(el){el.hidden=true;});h.textContent=y+'年'+m+'月 当番表（案）を作成しました';}
      var proceed=document.createElement('button');proceed.type='button';proceed.textContent=allMatch?'人数一致・当番表案を見る':'人数不一致のため確認が必要';proceed.disabled=!allMatch;
      proceed.addEventListener('click',function(){
        var old=preview.querySelector('.duty-generated-plan');if(old)old.remove();
        var plan=document.createElement('section');plan.className='duty-generated-plan';
        var ph=document.createElement('b');ph.textContent=y+'年'+m+'月 当番表（案）';plan.appendChild(ph);
        var info=document.createElement('div');info.className='duty-generated-info';info.textContent='前月の続きから、各学年2家庭ずつ配置した試験案です。祝日・スケジュール・里山活動日を反映します。まだ公開・保存されません。';plan.appendChild(info);
        var lastTables=(window.DutyRosterData&&Array.isArray(window.DutyRosterData.INITIAL_TABLES))?window.DutyRosterData.INITIAL_TABLES:[];
        var startAfter={'2':'筒井','1':'小池'};
        if(window.DutyRosterData&&window.DutyRosterData.tableForImage){
          try{
            var currentImages=(window.dutyRosterState&&Array.isArray(window.dutyRosterState.images))?window.dutyRosterState.images:[];
            var targetPrev=new Date(y,m-2,1),py=targetPrev.getFullYear(),pm=targetPrev.getMonth()+1;
            currentImages.forEach(function(img){var t=window.DutyRosterData.tableForImage(img);if(!t||t.year!==py||t.month!==pm||!Array.isArray(t.rows)||!t.rows.length)return;var last=t.rows[t.rows.length-1],grades=t.grades||[2,1];grades.forEach(function(gr,idx){var second=last[3+idx*2];if(second)startAfter[String(gr)]=second;});});
          }catch(e){}
        }
        var gradeLists={};
        active.forEach(function(g){gradeLists[g]=Array.from(groups[g].values()).sort(function(a,b){return a.kana.localeCompare(b.kana,'ja')});});
        function key(v){return String(v||'').replace(/[（）()\s　]/g,'');}
        function startIndex(g){
          var list=gradeLists[g]||[], targetKey=key(startAfter[g]||'');
          var idx=list.findIndex(function(x){return key(x.name)===targetKey||key(x.name).startsWith(targetKey)||targetKey.startsWith(key(x.name));});
          return idx>=0?(idx+1)%list.length:0;
        }
        var pos={};active.forEach(function(g){pos[g]=startIndex(g);});
        function holidaySet(year){
          var set=new Set(),add=function(mm,dd){set.add(year+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'));};
          function nthMonday(mm,n){var first=new Date(year,mm-1,1).getDay();return 1+((8-first)%7)+(n-1)*7;}
          add(1,1);add(1,nthMonday(1,2));add(2,11);if(year>=2020)add(2,23);
          add(3,Math.floor(20.8431+.242194*(year-1980)-Math.floor((year-1980)/4)));add(4,29);add(5,3);add(5,4);add(5,5);
          add(7,nthMonday(7,3));add(8,11);add(9,nthMonday(9,3));add(9,Math.floor(23.2488+.242194*(year-1980)-Math.floor((year-1980)/4)));add(10,nthMonday(10,2));add(11,3);add(11,23);
          Array.from(set).forEach(function(k){var p=k.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]);if(d.getDay()===0){var s=new Date(d);do{s.setDate(s.getDate()+1);}while(set.has(s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0')));set.add(s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0'));}});
          return set;
        }
        var holidays=holidaySet(y),monthPrefix=y+'-'+String(m).padStart(2,'0')+'-',monthEvents=scheduleEvents.filter(function(ev){return String(ev&&ev.date||'').startsWith(monthPrefix);});
        var days=[],activityDays=new Set();
        for(var d=1;d<=new Date(y,m,0).getDate();d++){
          var dt=new Date(y,m-1,d),wd=dt.getDay(),date=monthPrefix+String(d).padStart(2,'0');
          var evs=monthEvents.filter(function(ev){return String(ev.date)===date;});
          var hasActivity=evs.length>0,weekend=wd===0||wd===6,holiday=holidays.has(date);
          if(hasActivity||weekend||holiday)days.push(d);
          if(evs.some(function(ev){return /里山/.test(String(ev.title||'')+' '+String(ev.note||'')+' '+String(ev.memo||''));}))activityDays.add(d);
        }
        var table=document.createElement('table');table.className='duty-generated-table';
        var thead=document.createElement('thead'),trh=document.createElement('tr');['日付','曜日'].concat(active.flatMap(function(g){return[g+'年',g+'年'];})).forEach(function(t){var th=document.createElement('th');th.textContent=t;trh.appendChild(th);});thead.appendChild(trh);table.appendChild(thead);
        var tbody=document.createElement('tbody'),wdLabel=['日','月','火','水','木','金','土'];
        days.forEach(function(day){var tr=document.createElement('tr'),dt=new Date(y,m-1,day);if(activityDays.has(day))tr.classList.add('is-activity');var td=document.createElement('td');td.textContent=day;tr.appendChild(td);td=document.createElement('td');td.textContent=wdLabel[dt.getDay()];tr.appendChild(td);
          active.forEach(function(g){var list=gradeLists[g]||[];for(var k=0;k<2;k++){var cell=document.createElement('td');if(list.length){cell.textContent=list[pos[g]%list.length].name;pos[g]=(pos[g]+1)%list.length;}tr.appendChild(cell);}});
          tbody.appendChild(tr);
        });table.appendChild(tbody);plan.appendChild(table);
        var warn=document.createElement('div');warn.className='duty-generated-warning';warn.textContent='土日・祝日・サイトのスケジュール登録日を対象にしています。黄色はスケジュールから判定した里山活動日です。';plan.appendChild(warn);
        var imageBox=document.createElement('section');imageBox.className='duty-generated-image';
        var imageTitle=document.createElement('b');imageTitle.textContent='原本画像プレビュー';imageBox.appendChild(imageTitle);
        var canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.max(900,250+days.length*78+260);var ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像生成を開始できませんでした');
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#079b51';ctx.fillRect(45,55,1110,72);
        ctx.fillStyle='#071426';ctx.font='700 31px sans-serif';ctx.fillText(y+'年',65,102);
        ctx.fillStyle='#ffffff';ctx.font='700 30px sans-serif';ctx.fillText(m+'月 当番表',510,102);
        var cols=[45,180,300,515,730,945,1155],headers=['日付','曜日','2年','2年','1年','1年'];
        ctx.font='700 25px sans-serif';for(var ci=0;ci<6;ci++){ctx.fillStyle='#079b51';ctx.fillRect(cols[ci],127,cols[ci+1]-cols[ci],62);ctx.strokeStyle='#27313d';ctx.strokeRect(cols[ci],127,cols[ci+1]-cols[ci],62);ctx.fillStyle='#071426';var tw=ctx.measureText(headers[ci]).width;ctx.fillText(headers[ci],cols[ci]+(cols[ci+1]-cols[ci]-tw)/2,168);}
        var trs=tbody.querySelectorAll('tr'),yy=189;trs.forEach(function(tr){var activity=tr.classList.contains('is-activity');ctx.fillStyle=activity?'#fff200':'#ffffff';ctx.fillRect(45,yy,1110,64);var cells=tr.querySelectorAll('td');cells.forEach(function(cell,ci){ctx.strokeStyle='#27313d';ctx.strokeRect(cols[ci],yy,cols[ci+1]-cols[ci],64);ctx.fillStyle='#071426';ctx.font='700 24px sans-serif';var txt=cell.textContent,tw=ctx.measureText(txt).width;ctx.fillText(txt,cols[ci]+(cols[ci+1]-cols[ci]-tw)/2,yy+41);});yy+=64;});
        ctx.fillStyle='#071426';ctx.font='700 22px sans-serif';ctx.fillText('☆ 当番の交代が必要な場合は、サイト内の「当番変更申請」より申請してください。',60,yy+65);ctx.fillText('　 申請後は、全体LINEでの共有も併せてお願いいたします。',60,yy+103);ctx.fillText('☆ 黄色の日は里山活動日になります。車の駐車場所に必ず気を付けてください。',60,yy+165);
        var img=document.createElement('img');img.alt=y+'年'+m+'月 当番表（案）画像';img.src=canvas.toDataURL('image/png');imageBox.appendChild(img);
        var dl=document.createElement('button');dl.type='button';dl.textContent='画像を保存';dl.addEventListener('click',function(){var a=document.createElement('a');a.href=img.src;a.download='当番表_'+y+'年'+String(m).padStart(2,'0')+'月_案.png';a.click();});imageBox.appendChild(dl);
        plan.appendChild(imageBox);
        table.hidden=true;warn.hidden=true;info.hidden=true;
        var finalActions=document.createElement('div');finalActions.className='duty-final-actions';
        var edit=document.createElement('button');edit.type='button';edit.textContent='詳細を確認';edit.addEventListener('click',function(){table.hidden=!table.hidden;warn.hidden=table.hidden;info.hidden=table.hidden;edit.textContent=table.hidden?'詳細を確認':'詳細を閉じる';});
        var confirm=document.createElement('button');confirm.type='button';confirm.textContent='この内容で確定（準備中）';confirm.disabled=true;
        finalActions.appendChild(edit);finalActions.appendChild(confirm);plan.appendChild(finalActions);
        preview.appendChild(plan);plan.scrollIntoView({behavior:'smooth',block:'start'});
      });
      actions.appendChild(proceed);preview.appendChild(actions);
      if(allMatch){actions.hidden=true;setTimeout(function(){try{proceed.click();}catch(err){actions.hidden=false;preview.insertAdjacentHTML('beforeend','<div class="duty-family-warning">画像作成でエラーが発生しました：'+String(err&&err.message||err)+'</div>');}},0);}
    }catch(err){preview.style.display='block';preview.textContent='作成できませんでした：'+(err&&err.name==='AbortError'?'名簿取得がタイムアウトしました。':String(err&&err.message||err||'エラー'));}
    finally{create.disabled=false;} return false;
  };
}
function boot(){init();setTimeout(init,250);setTimeout(init,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();