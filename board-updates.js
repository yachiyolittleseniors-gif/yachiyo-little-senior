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
    const cutoff=new Date();
    cutoff.setMonth(cutoff.getMonth()-1);
    return history.filter(item=>{
      const time=new Date(item&&item.updatedAt).getTime();
      return Number.isFinite(time)&&time>=cutoff.getTime()&&item.message;
    }).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  }

  function renderHistory(history){
    historyList.replaceChildren();
    history.forEach(item=>{
      const row=document.createElement('div');
      row.className='update-history-item';
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
      row.append(date,category,message);
      historyList.appendChild(row);
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
    const date=formatDate(data&&data.updatedAt);
    if(!data||!date||!data.message)return false;
    const wasOpen=Boolean(preserveOpen&&!historyPanel.hidden);
    const history=recentHistory(Array.isArray(data.history)?data.history:[data]);
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
})();

(function(){
  const API='/.netlify/functions/attendance-data';
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
  }

  function setEndedUI(ended){
    setAttendanceEnabled(ended);
    warning.style.display='none';
    endBtn.dataset.warningShown='0';
    endBtn.textContent='伝助を終了';

    if(ended){
      legacyCard.style.display='none';
      attendanceCard.style.display='block';
      endBtn.style.display='none';
      resumeBtn.style.display='';
      adminStatus.textContent='伝助の移行は終了しています。保護者出欠確認を利用できます。';
    }else{
      legacyCard.style.display='block';
      attendanceCard.style.display='block';
      endBtn.style.display='';
      resumeBtn.style.display='none';
      adminStatus.textContent='伝助終了前は、保護者出欠確認を開くことはできません。';
    }
  }

  // 初回表示は保護者出欠確認を優先し、設定取得後に必要な場合だけ伝助へ切り替える。
  setAttendanceEnabled(true);

  async function loadSetting(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const r=await fetch(API,{
        cache:'no-store',
        headers:{'x-access-password':accessPassword}
      });
      if(!r.ok) throw new Error('setting');
      const j=await r.json();
      const ended = j?.config?.migrationEnded === true;
      setEndedUI(ended);
    }catch(e){
      setEndedUI(true);
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
      coachPasswordStatus.textContent='パスワードを変更しました。';
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
      '伝助を終了しますか？\n\n登録済みの同名回答者について、日付が一致する○△×とコメントだけを1回取り込みます。\n伝助側の名前や日程は追加しません。'
    );
    if(!ok) return;

    endBtn.disabled=true;
    endBtn.textContent='移行中...';

    try{
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
      showSaveNotice(`回答${j?.importedAnswers||0}件・コメント${j?.importedComments||0}件を取り込み、伝助を終了しました`);
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
      '伝助移行を再開しますか？\n\n保護者出欠確認は再びグレーになり、開けない状態に戻ります。\n保存済みの保護者出欠確認データは削除しません。'
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
