(function(){'use strict';
function init(){
  var prev=document.getElementById('dutyAutoPrevMonth'),next=document.getElementById('dutyAutoNextMonth'),label=document.getElementById('dutyAutoMonthLabel'),create=document.getElementById('dutyAutoTestCreate'),preview=document.getElementById('dutyAutoTestPreview');
  if(!prev||!next||!label||!create||!preview||create.dataset.dutySimpleBound==='1')return;
  create.dataset.dutySimpleBound='1';
  var now=new Date(),target=new Date(now.getFullYear(),now.getMonth()+1,1);
  try{
    var known=[{year:2026,month:9},{year:2026,month:10}];
    if(window.dutyRosterState&&Array.isArray(window.dutyRosterState.images)&&window.DutyRosterData&&window.DutyRosterData.tableForImage){
      window.dutyRosterState.images.forEach(function(img){var t=window.DutyRosterData.tableForImage(img);if(t&&Number(t.year)&&Number(t.month))known.push({year:Number(t.year),month:Number(t.month)});});
    }
    known.sort(function(a,b){return a.year-b.year||a.month-b.month;});
    var latest=known[known.length-1];if(latest)target=new Date(latest.year,latest.month,1);
  }catch(e){}
  function paint(){label.textContent=target.getFullYear()+'年 '+(target.getMonth()+1)+'月';}
  paint();
  prev.onclick=function(e){e.preventDefault();target=new Date(target.getFullYear(),target.getMonth()-1,1);paint();};
  next.onclick=function(e){e.preventDefault();target=new Date(target.getFullYear(),target.getMonth()+1,1);paint();};
  function familyKey(v){return String(v||'').normalize('NFKC').trim().split(/[\s　（(]/)[0].replace(/[父母]$/,'');}
  function displayName(v){var s=String(v||'').replace(/[父母]$/,'').trim();return s.replace(/^([^\s　（(]+)[\s　]+(.+)$/,function(_,a,b){return a+'（'+b.replace(/[（）()]/g,'')+'）';});}
  function disambiguateDuplicateFamilies(groups){Object.keys(groups).forEach(function(g){var items=Array.from(groups[g].values()),byFamily=new Map();items.forEach(function(item){var kana=String(item.kana||'').normalize('NFKC').replace(/[父母]$/,'').trim(),raw=String(item.rawName||item.name||'').replace(/[父母]$/,'').trim(),fam=String(item.family||familyKey(raw));var key=fam;if(!key&&kana)key=kana.split(/[\s　]/)[0];var arr=byFamily.get(key)||[];arr.push(item);byFamily.set(key,arr);});byFamily.forEach(function(arr,fam){if(arr.length<2)return;arr.forEach(function(item,index){var raw=String(item.rawName||item.name||'').replace(/[父母]$/,'').trim(),kana=String(item.kana||'').normalize('NFKC').replace(/[父母]$/,'').trim(),rest=raw.replace(String(fam),'').replace(/[（）()\s　]/g,'');if(!rest){var parts=kana.split(/[\s　]+/).filter(Boolean);rest=parts.length>1?parts.slice(1).join(''):'';}if(!rest)rest=String(index+1);item.name=String(fam)+'（'+rest+'）';});});});}
  function holidays(year){var s=new Set(),add=(m,d)=>s.add(year+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')),nth=(m,n)=>1+((8-new Date(year,m-1,1).getDay())%7)+(n-1)*7;add(1,1);add(1,nth(1,2));add(2,11);add(2,23);add(3,Math.floor(20.8431+.242194*(year-1980)-Math.floor((year-1980)/4)));add(4,29);add(5,3);add(5,4);add(5,5);add(7,nth(7,3));add(8,11);add(9,nth(9,3));add(9,Math.floor(23.2488+.242194*(year-1980)-Math.floor((year-1980)/4)));add(10,nth(10,2));add(11,3);add(11,23);return s;}
  create.onclick=async function(e){
    e.preventDefault();create.disabled=true;create.textContent='作成中…';preview.hidden=false;preview.innerHTML='<div class="duty-simple-status">名簿・スケジュールを確認しています…</div>';
    try{
      var headers={},access=sessionStorage.getItem('yachiyoAttendancePass')||'';if(access)headers['x-access-password']=access;
      var results=await Promise.all([
        fetch('/.netlify/functions/attendance-data',{cache:'no-store',credentials:'same-origin',headers:headers}),
        fetch('/.netlify/functions/site-data?section=players',{cache:'no-store',credentials:'same-origin'}),
        fetch('/.netlify/functions/site-data?section=schedule',{cache:'no-store',credentials:'same-origin'})
      ]);
      if(results.some(r=>!r.ok))throw new Error('必要なデータを取得できませんでした。');
      var att=await results[0].json(),pj=await results[1].json(),sj=await results[2].json(),members=att?.data?.members||[],players=Array.isArray(pj?.data)?pj.data:[],schedule=Array.isArray(sj?.data)?sj.data:[];
      var groups={'1':new Map(),'2':new Map(),'3':new Map()},pc={'1':0,'2':0,'3':0};
      members.forEach(function(mem){var g=String(mem?.grades?.[0]||mem?.grade||'');if(!groups[g])return;var raw=String(mem?.name||'').replace(/[父母]$/,'').trim(),family=familyKey(raw),n=displayName(raw),k=String(mem?.kana||n).replace(/[父母]$/,'').trim().normalize('NFKC');if(n&&!groups[g].has(k))groups[g].set(k,{name:n,rawName:raw,family:family,kana:k});});
      players.forEach(function(p){var m=String(p?.grade||'').match(/^([123])年/);if(m)pc[m[1]]++;});
      disambiguateDuplicateFamilies(groups);
      var y=target.getFullYear(),mo=target.getMonth()+1,active=mo>=6?['2','1']:['3','2','1'],bad=active.filter(g=>groups[g].size!==pc[g]);
      if(bad.length){preview.innerHTML='<div class="duty-simple-error"><b>人数が一致しません</b><br>'+bad.map(g=>g+'年：選手'+pc[g]+'名／家庭'+groups[g].size+'家庭').join('<br>')+'</div>';return;}
      var lists={};active.forEach(function(g){
        lists[g]=Array.from(groups[g].values()).sort(function(a,b){return a.kana.localeCompare(b.kana,'ja')});
        // 当番表では同姓を確実に識別する。名簿側が名字のみでも既存運用の識別名を補完する。
        var knownSuffix={
          '1':{'山本':['要','諒'],'井上':['遙','竜']},
          '2':{'石川':['圭','晃']}
        };
        var suffixMap=knownSuffix[g]||{},used={};
        lists[g].forEach(function(item){
          var raw=String(item.name||'').replace(/[父母]$/,'').trim();
          var fam=Object.keys(suffixMap).find(function(s){return raw.indexOf(s)===0;})||familyKey(raw);
          var suffixes=suffixMap[fam];if(!suffixes)return;
          var m=raw.match(/[（(]([^）)]+)[）)]/);
          if(m&&m[1]){used[fam]=(used[fam]||0)+1;return;}
          var idx=used[fam]||0;if(suffixes[idx])item.name=fam+'（'+suffixes[idx]+'）';used[fam]=idx+1;
        });
      });
      var startAfter={'2':'筒井','1':'小池'},pos={};
      function key(v){return String(v||'').replace(/[（）()\s　]/g,'');}
      active.forEach(function(g){var i=lists[g].findIndex(x=>key(x.name).startsWith(key(startAfter[g]))||key(startAfter[g]).startsWith(key(x.name)));pos[g]=i>=0?(i+1)%lists[g].length:0;});
      var prefix=y+'-'+String(mo).padStart(2,'0')+'-',hs=holidays(y),events=schedule.filter(ev=>String(ev?.date||'').startsWith(prefix)),days=[],satoyama=new Set();
      for(var d=1;d<=new Date(y,mo,0).getDate();d++){var dt=new Date(y,mo-1,d),date=prefix+String(d).padStart(2,'0'),evs=events.filter(ev=>ev.date===date);if(dt.getDay()===0||dt.getDay()===6||hs.has(date)||evs.length)days.push(d);var saturdayOrdinal=Math.ceil(d/7);
        if((dt.getDay()===6&&(saturdayOrdinal===2||saturdayOrdinal===4))||evs.some(ev=>/里山/.test(String(ev.title||'')+' '+String(ev.note||'')+' '+String(ev.memo||''))))satoyama.add(d);}
      var rows=days.map(function(d){var dt=new Date(y,mo-1,d),r=[d,['日','月','火','水','木','金','土'][dt.getDay()]];active.forEach(function(g){for(var z=0;z<2;z++){r.push(lists[g][pos[g]%lists[g].length].name);pos[g]++;}});return r;});
      var canvas=document.createElement('canvas');canvas.width=1400;canvas.height=Math.max(1050,330+rows.length*82+300);var ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を生成できませんでした。');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      var totalW=1310,left=Math.round((canvas.width-totalW)/2),top=50,monthW=125,dateW=90,dowW=90,dataW=(totalW-monthW-dateW-dowW)/4;
      var x=[left,left+monthW,left+monthW+dateW,left+monthW+dateW+dowW];
      for(var ci=0;ci<4;ci++)x.push(x[3]+dataW*(ci+1));
      ctx.strokeStyle='#20252b';ctx.lineWidth=2;
      ctx.fillStyle='#079b51';ctx.fillRect(left,top,totalW,64);
      ctx.strokeRect(left,top,totalW,64);
      ctx.fillStyle='#071426';ctx.font='700 27px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(y+'年',left+monthW/2,top+32);ctx.fillText('日付',x[1]+dateW/2,top+32);ctx.fillText('曜日',x[2]+dowW/2,top+32);
      var g1=active[0]||'2',g2=active[1]||'1';
      ctx.fillText(g1+'年',(x[3]+x[5])/2,top+32);ctx.fillText(g2+'年',(x[5]+x[7])/2,top+32);
      var rowTop=top+64,rowH=72,monthBottom=rowTop+rows.length*rowH;
      ctx.fillStyle='#fff';ctx.fillRect(left,rowTop,monthW,rows.length*rowH);ctx.strokeRect(left,rowTop,monthW,rows.length*rowH);
      ctx.fillStyle='#071426';ctx.font='700 30px sans-serif';ctx.fillText(mo+'月',left+monthW/2,rowTop+rows.length*rowH/2);
      rows.forEach(function(r,ri){
        var yy=rowTop+ri*rowH;ctx.fillStyle=satoyama.has(r[0])?'#fff200':'#fff';ctx.fillRect(x[1],yy,totalW-monthW,rowH);
        for(var cidx=1;cidx<7;cidx++)ctx.strokeRect(x[cidx],yy,x[cidx+1]-x[cidx],rowH);
        ctx.font='700 25px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        r.forEach(function(t,i){
          if(i===0){ctx.fillStyle=r[1]==='日'?'#c73535':r[1]==='土'?'#2c67a8':'#071426';ctx.fillText(String(t),x[1]+dateW/2,yy+rowH/2);}
          else if(i===1){ctx.fillStyle=t==='日'?'#c73535':t==='土'?'#2c67a8':'#071426';ctx.fillText(String(t),x[2]+dowW/2,yy+rowH/2);}
          else{ctx.fillStyle='#071426';var cx=x[i+1]+(x[i+2]-x[i+1])/2;ctx.fillText(String(t),cx,yy+rowH/2);}
        });
      });
      var noteY=monthBottom+58;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#071426';ctx.font='700 22px sans-serif';
      ctx.fillText('☆　都合によりお当番の交代は可能です。その際は、下記のご対応をお願いいたします。',left+25,noteY);
      ctx.font='600 20px sans-serif';ctx.fillText('① サイト内の「当番変更申請」より申請してください。',left+100,noteY+40);ctx.fillText('② 申請後は、全体LINEでの共有も併せてお願いいたします。',left+100,noteY+78);
      ctx.font='700 22px sans-serif';ctx.fillText('☆　黄色の日は里山活動日になります。車の駐車場所に必ず気を付けてください。',left+25,noteY+145);
      var src=canvas.toDataURL('image/png');preview.innerHTML='';var title=document.createElement('b');title.textContent=y+'年'+mo+'月 当番表（案）';var img=document.createElement('img');img.className='duty-simple-image';img.src=src;img.alt=title.textContent;var actions=document.createElement('div');actions.className='duty-simple-actions';var dl=document.createElement('button');dl.type='button';dl.textContent='画像を保存';dl.onclick=async function(){
        var filename='当番表_'+y+'年'+String(mo).padStart(2,'0')+'月_案.png';
        try{
          var blob=await new Promise(function(resolve,reject){canvas.toBlob(function(b){b?resolve(b):reject(new Error('画像変換に失敗しました'));},'image/png');});
          var file=new File([blob],filename,{type:'image/png'});
          if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:filename});return;}
          var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);
        }catch(err){
          if(err&&err.name==='AbortError')return;
          var w=window.open(src,'_blank');if(!w)alert('画像を開けませんでした。画像を長押しして保存してください。');
        }
      };var detail=document.createElement('button');detail.type='button';detail.textContent='詳細を見る';detail.onclick=function(){var box=preview.querySelector('.duty-simple-detail');box.hidden=!box.hidden;};var confirmBtn=document.createElement('button');confirmBtn.type='button';confirmBtn.textContent='この案で確定';confirmBtn.onclick=async function(){
        if(!window.confirmGeneratedDutyRoster){alert('当番表の登録機能を読み込めませんでした。ページを再読み込みしてください。');return;}
        if(!confirm(y+'年'+mo+'月の当番表をこの案で確定・登録しますか？'))return;
        confirmBtn.disabled=true;confirmBtn.textContent='登録中…';
        try{
          var ok=await window.confirmGeneratedDutyRoster({name:'当番表_'+y+'年'+String(mo).padStart(2,'0')+'月.png',data:src,table:{year:y,month:mo,grades:active.slice(),activityDays:Array.from(satoyama),rows:rows}});
          if(ok){confirmBtn.textContent='確定済み';confirmBtn.disabled=true;}
          else{confirmBtn.textContent='この案で確定';confirmBtn.disabled=false;}
        }catch(err){confirmBtn.textContent='この案で確定';confirmBtn.disabled=false;alert(err?.message||'当番表を登録できませんでした。');}
      };confirmBtn.style.setProperty('color','#d4af37','important');confirmBtn.style.setProperty('-webkit-text-fill-color','#d4af37','important');confirmBtn.style.fontWeight='900';actions.append(dl,detail,confirmBtn);var detailBox=document.createElement('div');detailBox.className='duty-simple-detail';detailBox.hidden=true;detailBox.textContent='選手数と家庭数：一致　／　対象日：土日・祝日・スケジュール登録日　／　黄色：里山活動日';preview.append(title,img,actions,detailBox);
    }catch(err){preview.innerHTML='<div class="duty-simple-error"><b>作成できませんでした</b><br>'+String(err?.message||err)+'</div>';}
    finally{create.disabled=false;create.textContent='当番表（案）を作成';}
  };
}

function initTemporaryDuty(){
  var open=document.getElementById('temporaryDutyCreateBtn'),box=document.getElementById('temporaryDutyBuilder'),rows=document.getElementById('temporaryDutyRows'),add=document.getElementById('temporaryDutyAddDate'),make=document.getElementById('temporaryDutyPreview'),result=document.getElementById('temporaryDutyResult');
  if(!open||!box||!rows||!add||!make||!result||open.dataset.bound==='1')return;open.dataset.bound='1';
  function row(){
    var d=document.createElement('div');d.className='temporary-duty-row';
    d.innerHTML='<input type="date" class="tmp-date"><select class="tmp-grade"><option value="3">3年</option><option value="2" selected>2年</option><option value="1">1年</option></select><select class="tmp-slot"><option value="午前">午前</option><option value="午後">午後</option><option value="終日">終日</option></select><input class="tmp-names" placeholder="担当者（例：石山・加藤）"><button type="button" class="tmp-remove">削除</button>';
    d.querySelector('.tmp-remove').onclick=function(){d.remove();};rows.appendChild(d);
  }
  open.onclick=function(){box.hidden=!box.hidden;if(!box.hidden&&!rows.children.length)row();};
  add.onclick=row;
  make.onclick=function(){var data=Array.from(rows.querySelectorAll('.temporary-duty-row')).map(function(r){return{date:r.querySelector('.tmp-date').value,grade:r.querySelector('.tmp-grade').value,slot:r.querySelector('.tmp-slot').value,names:r.querySelector('.tmp-names').value.trim()};}).filter(x=>x.date&&x.names);if(!data.length){alert('日付と担当者を入力してください。');return;}result.hidden=false;result.innerHTML='<b>臨時当番表（案）</b>'+data.map(x=>'<div>'+x.date+'　'+x.grade+'年　【'+x.slot+'】 '+x.names+'</div>').join('')+'<p>画像生成・確定保存は次の段階で接続します。</p>';};
}
function boot(){init();initTemporaryDuty();setTimeout(function(){init();initTemporaryDuty();},250);setTimeout(function(){init();initTemporaryDuty();},1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();