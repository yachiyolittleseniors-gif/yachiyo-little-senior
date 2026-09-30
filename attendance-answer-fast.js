/* Guardian attendance: rapid taps first, quiet debounced saves second. */
(function(){
  'use strict';

  let flushTimer=0;
  let slowNoticeTimer=0;

  function hideWaitNotice(){
    clearTimeout(slowNoticeTimer);
    const notice=document.getElementById('answerWaitNotice');
    if(notice)notice.hidden=true;
  }

  function showSlowWaitNotice(){
    clearTimeout(slowNoticeTimer);
    slowNoticeTimer=setTimeout(()=>{
      if(!answerSaving)return;
      let notice=document.getElementById('answerWaitNotice');
      if(!notice){
        notice=document.createElement('div');
        notice.id='answerWaitNotice';
        notice.setAttribute('role','status');
        notice.setAttribute('aria-live','polite');
        document.body.appendChild(notice);
      }
      notice.textContent='保存中です。少しお待ちください。';
      notice.hidden=false;
    },900);
  }

  refreshAnswerCells=function(){
    document.querySelectorAll('#board .status-btn').forEach(button=>{
      const m=button.dataset.member,e=button.dataset.event,s=data.answers?.[m]?.[e]||'';
      button.textContent=s||'・';
      button.className='status-btn '+statusClass(s);
      button.disabled=m!==selectedMember;
      button.onclick=saveAnswer;
    });
    document.querySelectorAll('[data-summary-event]').forEach(button=>{
      const counts=button.querySelector('.event-counts');
      if(counts)counts.innerHTML=countMarkup(countStatuses(button.dataset.summaryEvent));
    });
  };

  showAnswerSaveState=function(){
    const status=$('#syncText');

    if(answerSaveFailed){
      hideWaitNotice();
      status.textContent='未保存があります ';
      const retry=document.createElement('button');
      retry.type='button';
      retry.textContent='再保存';
      retry.onclick=flushAnswers;
      status.appendChild(retry);
      return;
    }

    if(answerSaving){
      status.textContent='保存中…';
      showSlowWaitNotice();
      return;
    }

    hideWaitNotice();

    if(pendingAnswers.size){
      // User is still tapping. Do not interrupt with a save toast.
      status.textContent='入力中…';
      return;
    }

    status.textContent='保存済み '+new Date().toLocaleTimeString('ja-JP',{
      hour:'2-digit',minute:'2-digit'
    });
  };

  function scheduleFlush(){
    clearTimeout(flushTimer);
    // Save only after taps settle, so ○× can be changed rapidly.
    flushTimer=setTimeout(()=>void flushAnswers(),450);
  }

  flushAnswers=async function(){
    if(answerSaving||!pendingAnswers.size)return;

    clearTimeout(flushTimer);
    answerSaving=true;
    answerSaveFailed=false;
    showAnswerSaveState();

    const batch=[...pendingAnswers.entries()];
    const results=await Promise.all(batch.map(async([key,item])=>{
      try{
        await api('POST',{
          action:'answer',
          memberId:item.memberId,
          eventId:item.eventId,
          status:item.status
        });
        // Delete only if the same cell was not changed again while saving.
        if(pendingAnswers.get(key)===item)pendingAnswers.delete(key);
        return true;
      }catch{
        return false;
      }
    }));

    answerSaveFailed=results.some(ok=>!ok);
    answerSaving=false;
    refreshAnswerCells();
    showAnswerSaveState();

    if(pendingAnswers.size&&!answerSaveFailed)scheduleFlush();
  };

  saveAnswer=function(ev){
    const b=ev.currentTarget,m=b.dataset.member,e=b.dataset.event;
    if(m!==selectedMember)return;

    const s=nextStatus(data.answers?.[m]?.[e]||'');
    data.answers[m]??={};
    if(s)data.answers[m][e]=s;
    else delete data.answers[m][e];

    pendingAnswers.set(JSON.stringify([m,e]),{
      memberId:m,eventId:e,status:s
    });

    refreshAnswerCells();
    showAnswerSaveState();
    scheduleFlush();
  };

  if(document.querySelector('#board .status-btn'))refreshAnswerCells();
})();