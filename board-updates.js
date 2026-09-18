// Created by tatsuki.saitoh
(function(){
  const API='/.netlify/functions/site-data?section=board-latest-update';
  const CACHE_KEY='yachiyoBoardLatestUpdateCacheV1';
  const announcement=document.getElementById('latestUpdateAnnouncement');
  const dateElement=document.getElementById('latestUpdateDate');
  const categoryElement=document.getElementById('latestUpdateCategory');
  const messageElement=document.getElementById('latestUpdateMessage');
  const historyPanel=document.getElementById('updateHistoryPanel');
  const historyList=document.getElementById('updateHistoryList');
  const historyHint=document.getElementById('latestUpdateHint');
  const categories={documents:'資料保存','duty-roster':'当番表',schedule:'カレンダー',rules:'チーム規約'};

  if(!announcement||!dateElement||!categoryElement||!messageElement||!historyPanel||!historyList||!historyHint)return;

  function formatDate(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric'}).format(date);
  }

  function recentHistory(value){
    const history=Array.isArray(value)?value:[];
    return history.filter(item=>{
      const time=new Date(item&&item.updatedAt).getTime();
      return item.category!=='duty-roster'&&Number.isFinite(time)&&item.message;
    }).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,20);
  }

  function quotedName(message){
    const match=String(message||'').match(/[「『](.+?)[」』]/);
    return match?match[1]:'';
  }

  function historyHref(item){
    const message=String(item&&item.message||'');
    const category=String(item&&item.category||'');
    if(category==='documents'){
      const params=new URLSearchParams();
      if(message.startsWith('審判部資料'))params.set('department','referee');
      const name=quotedName(message);
      if(name)params.set('focusName',name);
      return './secretariat-documents.html?'+params.toString();
    }
    if(category==='schedule'){
      const params=new URLSearchParams({focus:'schedule'});
      const title=quotedName(message);
      if(title)params.set('focusTitle',title);
      if(item&&item.updatedAt)params.set('focusUpdatedAt',String(item.updatedAt));
      return './board.html?'+params.toString();
    }
    if(category==='duty-roster')return './board.html?focus=duty-roster';
    if(category==='rules')return './secretariat-documents.html?department=rules';
    return './board.html';
  }

  function renderHistory(history){
    historyList.replaceChildren();
    history.forEach(item=>{
      const row=document.createElement('a');
      row.className='update-history-item';
      row.href=historyHref(item);
      row.setAttribute('aria-label',String(item.message||'')+'の画面を開く');
      const date=document.createElement('time');
      date.className='update-history-date';
      date.dateTime=String(item.updatedAt||'');
      date.textContent=formatDate(item.updatedAt);
      const category=document.createElement('span');
      category.className='update-history-category';
      category.textContent=categories[item.category]||'更新';
      const message=document.createElement('span');
      message.className='update-history-message';
      message.textContent=String(item.message||'');
      const arrow=document.createElement('span');
      arrow.className='update-history-arrow';
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent='›';
      row.append(date,category,message,arrow);
      historyList.appendChild(row);
    });
  }

  function focusRequestedBoardSection(){
    const focus=new URLSearchParams(location.search).get('focus')||'';
    const target=focus==='duty-roster'
      ?document.getElementById('dutyRosterCard')
      :focus==='rules'
        ?document.getElementById('teamRulesCard')
        :null;
    if(!target)return;
    Promise.resolve(window.boardAccessReady).catch(()=>{}).finally(()=>{
      setTimeout(()=>{
        target.scrollIntoView({behavior:'smooth',block:'center'});
        target.classList.add('history-focus-target');
        setTimeout(()=>target.classList.remove('history-focus-target'),2600);
      },260);
    });
  }

  function setHistoryOpen(open){
    const hasHistory=historyList.childElementCount>0;
    const next=Boolean(open&&hasHistory);
    historyPanel.hidden=!next;
    announcement.setAttribute('aria-expanded',String(next));
    historyHint.textContent=next?'履歴を閉じる ▲':'履歴を見る ▼';
  }

  function displayUpdate(data,preserveOpen){
    const wasOpen=Boolean(preserveOpen&&!historyPanel.hidden);
    const history=recentHistory(data&&Array.isArray(data.history)?data.history:[data]);
    // 当番表は専用の変更履歴で確認するため、共通の更新案内から除外する。
    const latest=data&&data.category!=='duty-roster'?data:history[0];
    const date=formatDate(latest&&latest.updatedAt);
    if(!latest||!date||!latest.message){
      renderHistory([]);
      setHistoryOpen(false);
      announcement.hidden=true;
      return false;
    }
    data=latest;
    renderHistory(history);
    historyHint.hidden=history.length===0;
    setHistoryOpen(wasOpen);
    dateElement.dateTime=String(data.updatedAt||'');
    dateElement.textContent=date;
    categoryElement.textContent=categories[data.category]||'更新';
    messageElement.textContent=String(data.message);
    announcement.hidden=false;
    return true;
  }

  announcement.addEventListener('click',()=>setHistoryOpen(historyPanel.hidden));
  announcement.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    setHistoryOpen(historyPanel.hidden);
  });

  let hasDisplayedData=false;
  try{
    const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    hasDisplayedData=displayUpdate(cached,false);
  }catch(error){
    sessionStorage.removeItem(CACHE_KEY);
  }

  async function load(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const response=await fetch(API,{cache:'no-store',headers:{'x-access-password':accessPassword}});
      if(!response.ok)throw new Error('load failed');
      const body=await response.json();
      const data=body&&body.data;
      if(!displayUpdate(data,true)){
        sessionStorage.removeItem(CACHE_KEY);
        if(!hasDisplayedData){announcement.hidden=true;historyPanel.hidden=true}
        return;
      }
      hasDisplayedData=true;
      sessionStorage.setItem(CACHE_KEY,JSON.stringify(data));
    }catch(e){
      if(hasDisplayedData)return;
      dateElement.textContent='';
      categoryElement.textContent='';
      messageElement.textContent='更新情報を読み込めませんでした。';
      historyHint.hidden=true;
      historyPanel.hidden=true;
      announcement.hidden=false;
    }
  }

  window.refreshBoardLatestUpdate=load;
  load();
  focusRequestedBoardSection();
})();

(function(){
  const API='/.netlify/functions/attendance-data';
  const PLAYER_API='/.netlify/functions/player-attendance-data';
  const attendanceBtn=document.getElementById('attendanceOpenBtn');
  const attendanceCard=document.getElementById('attendanceCard');
  const playerAttendanceBtn=document.getElementById('playerAttendanceOpenBtn');
  const playerAttendanceCard=document.getElementById('playerAttendanceCard');
  const legacyCard=document.getElementById('densukeLegacyCard');
  const adminBtn=document.getElementById('densukeToggleBtn');
  const panel=document.getElementById('densukeAdminPanel');
  const endBtn=document.getElementById('endDensukeBtn');
  const resumeBtn=document.getElementById('resumeDensukeBtn');
  const closeAdminBtn=document.getElementById('closeDensukeAdminBtn');
  const warning=document.getElementById('densukeWarning');
  const adminStatus=document.getElementById('densukeAdminStatus');
  const coachPasswordInput=document.getElementById('coachPasswordInput');
  const coachPasswordConfirmInput=document.getElementById('coachPasswordConfirmInput');
  const saveCoachPasswordBtn=document.getElementById('saveCoachPasswordBtn');
  const coachPasswordStatus=document.getElementById('coachPasswordStatus');

  if(!attendanceBtn || !attendanceCard || !playerAttendanceBtn || !playerAttendanceCard || !legacyCard || !adminBtn || !panel || !endBtn || !resumeBtn || !closeAdminBtn || !warning) return;

  function setAttendanceEnabled(enabled){
    const targets=[
      {card:attendanceCard,button:attendanceBtn,fallback:'./attendance.html'},
      {card:playerAttendanceCard,button:playerAttendanceBtn,fallback:'./player-attendance.html'}
    ];

    targets.forEach(({card,button,fallback})=>{
      card.classList.toggle('disabled',!enabled);
      if(enabled){
        button.classList.remove('disabled');
        button.setAttribute('href',button.dataset.href || fallback);
        button.setAttribute('aria-disabled','false');
        button.removeAttribute('tabindex');
      }else{
        button.classList.add('disabled');
        button.removeAttribute('href');
        button.setAttribute('aria-disabled','true');
        button.setAttribute('tabindex','-1');
      }
    });

    // 伝助移行中はグレーの「工事中」表示を保ち、管理者だけ隠し入力で開ける。
    [attendanceBtn,playerAttendanceBtn].forEach(button=>{
      button.classList.toggle('admin-gated',!enabled);
      if(!enabled){
        button.setAttribute('aria-disabled','false');
        button.removeAttribute('tabindex');
        button.setAttribute('role','button');
      }else{
        button.removeAttribute('role');
      }
    });

  }

  function setEndedUI(ended){
    // 公開準備中のため、伝助終了後も保護者・選手出欠確認はグレー表示と隠しパスワードを維持する。
    setAttendanceEnabled(false);
    warning.style.display='none';
    endBtn.dataset.warningShown='0';
    endBtn.textContent='伝助を終了';

    if(ended){
      legacyCard.style.display='none';
      attendanceCard.style.display='block';
      endBtn.style.display='none';
      resumeBtn.style.display='';
      adminStatus.textContent='伝助の移行は終了しています。保護者出欠確認・選手出欠確認は公開準備中です。';
    }else{
      legacyCard.style.display='block';
      attendanceCard.style.display='block';
      endBtn.style.display='';
      resumeBtn.style.display='none';
      adminStatus.textContent='伝助終了前は、保護者・選手出欠確認を通常利用することはできません。';
    }
  }

  // 状態を確認できるまでは、保護者・選手出欠確認をグレー表示にする。
  setAttendanceEnabled(false);

  async function openProtectedAttendance(button,api,storageKey){
    const hidden=button.classList.contains('admin-gated');
    const saved=hidden?(sessionStorage.getItem(storageKey)||''):'';
    const adminPassword=saved||prompt(hidden?'現在工事中\nパスワードは入力できません':'管理者パスワードを入力してください。');
    if(!adminPassword)return;
    try{
      const response=await fetch(api,{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':adminPassword},
        body:JSON.stringify({action:'adminPing'})
      });
      if(response.status===429){alert('試行回数の上限です。15分後に再度お試しください。');return}
      if(!response.ok){sessionStorage.removeItem(storageKey);alert('管理者パスワードが違います。');return}
      sessionStorage.setItem(storageKey,adminPassword);
      location.assign(button.dataset.href||button.getAttribute('href'));
    }catch(e){sessionStorage.removeItem(storageKey);alert('管理者認証を確認できませんでした。')}
  }

  attendanceBtn.addEventListener('click',function(event){
    if(attendanceBtn.getAttribute('aria-disabled')==='true')return;
    if(!attendanceBtn.classList.contains('admin-gated'))return;
    event.preventDefault();
    openProtectedAttendance(attendanceBtn,API,'yachiyoAttendanceDraftAdminPass');
  });

  playerAttendanceBtn.addEventListener('click',function(event){
    if(playerAttendanceBtn.getAttribute('aria-disabled')==='true')return;
    if(!playerAttendanceBtn.classList.contains('admin-gated'))return;
    event.preventDefault();
    openProtectedAttendance(playerAttendanceBtn,PLAYER_API,'yachiyoPlayerAttendanceAdminPass');
  });

  async function loadSetting(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const r=await fetch(API+'?config=1',{
        cache:'no-store',
        headers:{'x-access-password':accessPassword}
      });
      if(!r.ok) throw new Error('setting');
      const j=await r.json();
      const ended = j?.config?.migrationEnded === true;
      setEndedUI(ended);
    }catch(e){
      setEndedUI(false);
    }
  }

  // コピーライトを2秒以内に5回タップ -> 管理表示
  const footer=document.querySelector('footer') || document.body;
  let taps=0,timer=null;
  footer.addEventListener('pointerup',function(e){
    taps++;
    clearTimeout(timer);
    timer=setTimeout(()=>taps=0,2000);
    if(taps>=5){
      taps=0;
      clearTimeout(timer);
      adminBtn.textContent='管理';
      adminBtn.style.setProperty('display','block','important');
    }
  },{passive:true});

  adminBtn.addEventListener('click',async()=>{
    if(panel.classList.contains('show')){
      panel.classList.remove('show');
      panel.dataset.adminPassword='';
      adminBtn.textContent='管理';
      adminBtn.style.setProperty('display','none','important');
      warning.style.display='none';
      endBtn.dataset.warningShown='0';
      endBtn.textContent='伝助を終了';
      return;
    }

    const adminPassword=prompt('パスワードを入力してください。');
    if(!adminPassword) return;

    try{
      const r=await fetch(API,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-password':adminPassword
        },
        body:JSON.stringify({action:'adminPing'})
      });

      if(r.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(r.status===401){
        alert('パスワードが違います。');
        return;
      }

      if(!r.ok){
        alert('管理者認証を確認できませんでした。');
        return;
      }

      panel.dataset.adminPassword=adminPassword;
      panel.classList.add('show');
      adminBtn.textContent='管理終了';
    }catch(e){
      alert('管理者認証を確認できませんでした。');
    }
  });

  saveCoachPasswordBtn.addEventListener('click',async()=>{
    const adminPassword=panel.dataset.adminPassword||'';
    const password=coachPasswordInput.value;
    const confirmation=coachPasswordConfirmInput.value;
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(password.length<8){alert('パスワードは8文字以上で入力してください。');return}
    if(password!==confirmation){alert('確認用パスワードが一致しません。');return}
    if(!confirm('指導者出欠確認のパスワードを変更しますか？'))return;

    saveCoachPasswordBtn.disabled=true;
    saveCoachPasswordBtn.textContent='変更中...';
    coachPasswordStatus.textContent='';
    try{
      const response=await fetch('/.netlify/functions/coach-attendance-data',{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':adminPassword},
        body:JSON.stringify({action:'setCoachPassword',password:password})
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'パスワードを変更できませんでした。');
      coachPasswordInput.value='';
      coachPasswordConfirmInput.value='';
      sessionStorage.removeItem('yachiyoCoachAttendancePass');
      localStorage.removeItem('yachiyoCoachAttendanceReloadPass');
      localStorage.removeItem('yachiyoCoachAttendanceReloadPassExpires');
      localStorage.removeItem('yachiyoCoachPasskeyRegistered');
      coachPasswordStatus.textContent='パスワードを変更しました。生体認証は再登録が必要です。';
      showSaveNotice('指導者出欠確認のパスワードを変更しました');
    }catch(e){
      coachPasswordStatus.textContent=e.message||'パスワードを変更できませんでした。';
      alert(coachPasswordStatus.textContent);
    }finally{
      saveCoachPasswordBtn.disabled=false;
      saveCoachPasswordBtn.textContent='パスワードを変更';
    }
  });

  endBtn.addEventListener('click',async()=>{
    // 1回目は赤い警告を表示。2回目で終了処理へ進む。
    if(endBtn.dataset.warningShown!=='1'){
      warning.style.display='block';
      endBtn.dataset.warningShown='1';
      endBtn.textContent='確認して伝助を終了';
      warning.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }

    const adminPassword=prompt('パスワードを入力してください。');
    if(!adminPassword) return;

    try{
      const auth=await fetch(API,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-password':adminPassword
        },
        body:JSON.stringify({action:'adminPing'})
      });
      if(auth.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(auth.status===401){
        alert('パスワードが違います。');
        return;
      }
      if(!auth.ok){
        alert('管理者認証を確認できませんでした。');
        return;
      }
    }catch(e){
      alert('管理者認証を確認できませんでした。');
      return;
    }

    const ok=confirm(
      '伝助を終了しますか？\n\n保護者用・選手用の両方から、登録済みの同名回答者について、日付が一致する○△×とコメントだけを1回取り込みます。\n伝助側の名前や日程は追加しません。'
    );
    if(!ok) return;

    endBtn.disabled=true;
    endBtn.textContent='移行中...';

    try{
      // 選手用を先に取り込み、成功後に保護者用を終了する。
      // 保護者用の終了状態が画面全体の利用開始状態になる。
      const playerResponse=await fetch(PLAYER_API,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-password':adminPassword
        },
        body:JSON.stringify({action:'endDensuke'})
      });

      let playerResult={};
      try{ playerResult=await playerResponse.json(); }catch(e){}

      if(playerResponse.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(playerResponse.status===401){
        alert('パスワードが違います。');
        return;
      }
      if(!playerResponse.ok){
        alert(playerResult?.error || '選手用伝助の取り込みに失敗しました。');
        return;
      }

      const r=await fetch(API,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-password':adminPassword
        },
        body:JSON.stringify({action:'endDensuke'})
      });

      let j={};
      try{ j=await r.json(); }catch(e){}

      if(r.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(r.status===401){
        alert('パスワードが違います。');
        return;
      }

      if(!r.ok){
        alert(j?.error || '伝助の終了処理に失敗しました。');
        return;
      }

      setEndedUI(true);
      showSaveNotice(`保護者：回答${j?.importedAnswers||0}件・コメント${j?.importedComments||0}件／選手：回答${playerResult?.importedAnswers||0}件・コメント${playerResult?.importedComments||0}件を取り込み、伝助を終了しました`);
    }catch(e){
      alert('通信エラーのため、伝助は終了していません。');
    }finally{
      endBtn.disabled=false;
      if(endBtn.style.display!=='none'){
        endBtn.textContent='確認して伝助を終了';
      }
    }
  });

  closeAdminBtn.addEventListener('click',()=>{
    panel.classList.remove('show');
    panel.dataset.adminPassword='';
    adminBtn.textContent='管理';
    adminBtn.style.setProperty('display','block','important');
    warning.style.display='none';
    endBtn.dataset.warningShown='0';
    endBtn.textContent='伝助を終了';
  });

  resumeBtn.addEventListener('click',async()=>{
    const adminPassword=panel.dataset.adminPassword || prompt('パスワードを入力してください。');
    if(!adminPassword) return;

    const ok=confirm(
      '伝助移行を再開しますか？\n\n保護者出欠確認・選手出欠確認は再びグレーになり、工事中の隠しパスワード状態に戻ります。\n保存済みの出欠データは削除しません。'
    );
    if(!ok) return;

    resumeBtn.disabled=true;
    resumeBtn.textContent='再開中...';

    try{
      const r=await fetch(API,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-admin-password':adminPassword
        },
        body:JSON.stringify({action:'resumeDensuke'})
      });

      let j={};
      try{ j=await r.json(); }catch(e){}

      if(r.status===429){
        alert('試行回数の上限です。15分後に再度お試しください。');
        return;
      }
      if(r.status===401){
        alert('パスワードが違います。');
        return;
      }

      if(!r.ok){
        alert(j?.error || '伝助移行を再開できませんでした。');
        return;
      }

      setEndedUI(false);
      showSaveNotice('保存しました');
    }catch(e){
      alert('通信エラーのため、設定を変更できませんでした。');
    }finally{
      resumeBtn.disabled=false;
      resumeBtn.textContent='伝助移行を再開';
    }
  });

  loadSetting();
})();
